// Copyright 2016 Andrew Engelbrecht
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.


/*global Promise */
/*jslint unparam: true */

var swirlnet, util, swirlnetSolver,
    testOptions, sequentialTest,
    logProgress, testForWinner,
    createWorkerArray, parallelTest,
    littleFork;

swirlnet = require('swirlnet');
util = require('./util.js');
littleFork = require('little-fork');

// search for network solution using user supplied Promise based test callback
swirlnetSolver = function (options) {

    "use strict";

    var mainLoop, population, archive, generationNumber,
        bestFitnessThisGeneration, bestPhenotypeThisGeneration,
        workerArray;

    testOptions(options);

    population = swirlnet.makePopulation(options.inputCount, options.outputCount, options.genomeSettings || {});

    if (options.doNoveltySearch === true) {
        archive = swirlnet.makeArchive(options.noveltySearchOptions);
    }

    if (options.useWorkers) {
        workerArray = createWorkerArray(options.workerCount, options.workerPath);
    }

    generationNumber = 0;

    mainLoop = function () {

        var genomes, simulationPre, simulationPost;

        simulationPre = new Date();

        genomes = population.getGenomes();

        return (function () {

            if (options.useWorkers) {
                return parallelTest(workerArray, genomes, options, archive);
            }
            return sequentialTest(genomes, options, archive);

        }()).then(function (fitnesses) {

            var i, fittestGenomeIndex, sparsities, uniqueCount,
                sparsitiesPre, sparsitiesPost, isWinnerFound;

            simulationPost = new Date();

            bestFitnessThisGeneration = null;

            if (options.doNoveltySearch === true) {
                sparsitiesPre = new Date();
                sparsities = archive.getSparsities();
                sparsitiesPost = new Date();
            }

            for (i = 0; i < fitnesses.length; i += 1) {

                if (options.doNoveltySearch === true) {
                    population.setFitness(i, sparsities[i]);
                } else {
                    population.setFitness(i, fitnesses[i]);
                }

                if (bestFitnessThisGeneration === null || fitnesses[i] > bestFitnessThisGeneration) {

                    fittestGenomeIndex = i;
                    bestFitnessThisGeneration = fitnesses[fittestGenomeIndex];
                }
            }

            bestPhenotypeThisGeneration = swirlnet.genoToPheno(genomes[fittestGenomeIndex]);

            if (options.doNoveltySearch === true) {
                archive.archiveAndClear();

                uniqueCount = archive.getArchiveLength();
            }

            if (options.doNoveltySearch === true) {

                logProgress(generationNumber, bestFitnessThisGeneration, bestPhenotypeThisGeneration, (simulationPost - simulationPre), uniqueCount, (sparsitiesPost - sparsitiesPre));
                isWinnerFound = testForWinner(generationNumber, options.fitnessTarget, bestFitnessThisGeneration, bestPhenotypeThisGeneration, uniqueCount);

            } else {

                logProgress(generationNumber, bestFitnessThisGeneration, bestPhenotypeThisGeneration, (simulationPost - simulationPre));
                isWinnerFound = testForWinner(generationNumber, options.fitnessTarget, bestFitnessThisGeneration, bestPhenotypeThisGeneration);
            }

            if (isWinnerFound) {
                return true;
            }

            generationNumber += 1;

            // loop
            if (generationNumber < options.maxGenerations) {

                population.reproduce();

                return mainLoop();
            }

            // winner not found
            return false;
        });
    };

    return mainLoop().then(function (winnerFound) {

        if (!winnerFound) {

            console.log();
            console.log("no winner found in " + options.maxGenerations + " generations. last generation's best fitness: " + bestFitnessThisGeneration);
            console.log();
            console.log(bestPhenotypeThisGeneration);
            console.log();
        }

        if (options.useWorkers) {
            workerArray.map(function (worker) { worker.disconnect(); });
        }

        // bool
        return winnerFound;
    });
};

testOptions = function (options) {

    "use strict";

    console.assert(typeof options === "object", "swirlnet-solver-async: error: options must be an object");

    console.assert(util.isInt(options.inputCount), "swirlnet-solver-async: error: inputCount option must be an integer");
    console.assert(util.isInt(options.outputCount), "swirlnet-solver-async: error: outputCount option must be an integer");

    console.assert(typeof options.fitnessTarget === "number", "swirlnet-solver-async: error: fitnessTarget option must be a number");
    console.assert(util.isInt(options.maxGenerations), "swirlnet-solver-async: error: maxGenerations option must be an integer");

    console.assert(options.genomeSettings === undefined || typeof options.genomeSettings === "object", "swirlnet-solver-async: error: genomeSettings option must be an object or unspecified");
    console.assert(typeof options.doNoveltySearch === "boolean", "swirlnet-solver-async: error: doNoveltySearch option must be a boolean");

    if (options.doNoveltySearch) {
        console.assert(typeof options.noveltySearchOptions === "object", "swirlnet-solver-async: error: when doing novelty search, noveltySearchOptions option must be a an object.");
    }

    console.assert(typeof options.useWorkers === "boolean", "swirlnet-solver-async: error: useWorkers option must be a boolean");

    if (options.useWorkers) {
        console.assert(typeof options.workerPath === "string", "swirlnet-solver-async: error: workerPath option must be a string");
        console.assert(util.isInt(options.workerCount) && options.workerCount > 0, "swirlnet-solver-async: error: workerCount option must be a positive integer");
    } else {
        console.assert(typeof options.testFunction === "function", "swirlnet-solver-async: error: testFunction option must be a function");
    }

    console.assert(typeof options.testFunctionOptions === "object" || options.testFunctionOptions === undefined, "swirlnet-solver-async: error: testFunctionOpbtions option must be an object or undefined.");
};


sequentialTest = function (genomes, options, archive) {

    "use strict";

    var fitnesses;

    fitnesses = [];

    return genomes.reduce(function (promiseSequence, genome) {

        return promiseSequence.then(function () {

            var phenotype, net, resultsPromise;

            phenotype = swirlnet.genoToPheno(genome);
            net = swirlnet.makeNet(phenotype);

            resultsPromise = options.testFunction(net, options.testFunctionOptions);

            return resultsPromise.then(function (result) {

                fitnesses.push(result.fitness);
                if (options.doNoveltySearch === true) {
                    archive.noteBehavior(result.behavior, genome);
                }
            });
        });

    }, Promise.resolve()).then(function () {
        return fitnesses;
    });
};


parallelTest = function (workerArray, genomes, options, archive) {

    "use strict";

    var fitnesses, genomeIndexQueue, init, launchInitialTasks,
        launchNextTask, setListeners;

    init = function () {

        var i;

        fitnesses = [];
        genomeIndexQueue = [];

        for (i = 0; i < genomes.length; i += 1) {
            genomeIndexQueue.push(i);
        }
    };

    launchInitialTasks = function () {

        return Promise.all(workerArray.map(function (worker) {
            return new Promise(function (resolve, reject) {

                launchNextTask(worker, resolve, reject);
            });
        })).then(function () {

            return fitnesses;
        });
    };

    setListeners = function (worker, genomeIndex, resolve, reject) {

        // result obtained
        worker.replaceListener("message", function (message) {

            fitnesses[genomeIndex] = message.fitness;

            if (options.doNoveltySearch === true) {
                archive.noteBehavior(message.behavior, genomes[genomeIndex]);
            }

            launchNextTask(worker, resolve, reject);
        });

        // worker died
        worker.replaceListener("exit", function (code, signal) {

            if (code !== 0) {
                workerArray.map(function (worker) {

                    worker.kill();
                });
                reject(new Error("worker quit with exit code: " + code + " and signal: " + signal));
            }
        });
    };

    launchNextTask = function (worker, resolve, reject) {

        var genomeIndex, phenotype;

        genomeIndex = genomeIndexQueue.pop();

        setListeners(worker, genomeIndex, resolve, reject);

        if (genomeIndex !== undefined) {

            phenotype = swirlnet.genoToPheno(genomes[genomeIndex]);
            worker.send({"phenotype": phenotype, "options": options.testFunctionOptions});

        } else {
            resolve();
        }
    };

    init();

    return launchInitialTasks();
};


createWorkerArray = function (workerCount, workerPath) {

    "use strict";

    var i, workerArray;

    workerArray = [];

    for (i = 0; i < workerCount; i += 1) {

        workerArray.push(littleFork(workerPath));
    }

    return workerArray;
};


logProgress = function (generationNumber, bestFitnessThisGeneration, bestPhenotypeThisGeneration, simTime, uniqueCount, sparsitiesTime) {

    "use strict";

    if (uniqueCount !== undefined) {
        console.log("generation: " + generationNumber + "  uniques: " + uniqueCount + "  best fitness: " + bestFitnessThisGeneration);
    } else {
        console.log("generation: " + generationNumber + "  best fitness: " + bestFitnessThisGeneration);
    }

    console.log();
    console.log(bestPhenotypeThisGeneration);
    console.log();
    console.log("simulation step took " + simTime / 1000 + " seconds.");

    if (uniqueCount !== undefined) {
        console.log("sparsities step took " + sparsitiesTime / 1000 + " seconds.");
    }

    console.log();
};


testForWinner = function (generationNumber, fitnessTarget, bestFitnessThisGeneration, bestPhenotypeThisGeneration, uniqueCount) {

    "use strict";

    if (bestFitnessThisGeneration >= fitnessTarget) {

        console.log();

        if (uniqueCount !== undefined) {
            console.log("winner found in " + (generationNumber + 1) + " generations after " + uniqueCount + " uniques, with fitness: " + bestFitnessThisGeneration);
        } else {
            console.log("winner found in " + (generationNumber + 1) + " generations, with fitness: " + bestFitnessThisGeneration);
        }

        console.log();
        console.log("winning network:");
        console.log();
        console.log(bestPhenotypeThisGeneration);
        console.log();

        // winner found
        return true;
    }

    return false;
};


module.exports = swirlnetSolver;

