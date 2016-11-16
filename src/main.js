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
    killAllWorkers,
    promiseLoop, littleFork, assert, path;

swirlnet = require('swirlnet');
util = require('./util.js');
littleFork = require('little-fork');
promiseLoop = require('promise-loop');
assert = require('assert');
path = require('path');

// search for network solution using user supplied Promise based test callback
swirlnetSolver = function (options) {

    "use strict";

    var population, archive, generationNumber,
        doNextGeneration, testIfDone,
        bestFitnessThisGeneration, bestPhenotypeThisGeneration,
        workerArray;

    testOptions(options);

    population = swirlnet.makePopulation(options.inputCount, options.outputCount, options.genomeSettings || {});

    if (options.doNoveltySearch === true) {
        archive = swirlnet.makeArchive(options.noveltySearchOptions);
    }

    if (options.useWorkers) {
        workerArray = createWorkerArray(options.workerCount);
    }

    generationNumber = 0;

    doNextGeneration = function () {

        var genomes, simulationPre, simulationPost;

        genomes = population.getGenomes();

        simulationPre = new Date();

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

            population.reproduce();

            // winner not found
            return false;
        });
    };

    testIfDone = function (winnerFound, generationNumber) {

        if (winnerFound === true) {
            return true;
        }

        if (generationNumber >= options.maxGenerations) {
            return true;
        }

        return false;
    };

    return promiseLoop(doNextGeneration, testIfDone, Promise.resolve(false)).then(function (winnerFound) {

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

    }).catch(function (error) {

        if (options.useWorkers) {
            killAllWorkers(workerArray);
        }

        throw error;
    });
};

testOptions = function (options) {

    "use strict";

    assert(typeof options === "object", "swirlnet-solver-async: error: options must be an object");

    assert(util.isInt(options.inputCount), "swirlnet-solver-async: error: inputCount option must be an integer");
    assert(util.isInt(options.outputCount), "swirlnet-solver-async: error: outputCount option must be an integer");

    assert(typeof options.fitnessTarget === "number", "swirlnet-solver-async: error: fitnessTarget option must be a number");
    assert(util.isInt(options.maxGenerations), "swirlnet-solver-async: error: maxGenerations option must be an integer");

    assert(options.genomeSettings === undefined || typeof options.genomeSettings === "object", "swirlnet-solver-async: error: genomeSettings option must be an object or unspecified");
    assert(typeof options.doNoveltySearch === "boolean", "swirlnet-solver-async: error: doNoveltySearch option must be a boolean");

    if (options.doNoveltySearch) {
        assert(typeof options.noveltySearchOptions === "object", "swirlnet-solver-async: error: when doing novelty search, noveltySearchOptions option must be a an object.");
    }

    assert(typeof options.useWorkers === "boolean", "swirlnet-solver-async: error: useWorkers option must be a boolean");

    if (options.useWorkers) {

        assert(typeof options.testFile === "string", "swirlnet-solver-async: error: testFile option must be a string.");
        assert(path.isAbsolute(options.testFile), "swirlnet-solver-async: error: testFile option must be an absolute path.");

        assert(util.isInt(options.workerCount) && options.workerCount > 0, "swirlnet-solver-async: error: workerCount option must be a positive integer");
    } else {
        assert(typeof options.testFunction === "function", "swirlnet-solver-async: error: testFunction option must be a function");
    }

    assert(typeof options.testFunctionOptions === "object" || options.testFunctionOptions === undefined, "swirlnet-solver-async: error: testFunctionOpbtions option must be an object or undefined.");
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

        try {

            var taskComplete;

            taskComplete = false;

            // result obtained
            worker.replaceListener("message", function (message) {

                try {

                    fitnesses[genomeIndex] = message.fitness;

                    if (options.doNoveltySearch === true) {
                        archive.noteBehavior(message.behavior, genomes[genomeIndex]);
                    }

                    taskComplete = true;
                    launchNextTask(worker, resolve, reject);

                } catch (error) {
                    reject(error);
                }
            });

            // worker died
            worker.replaceListener("exit", function (code, signal) {

                if (!taskComplete || code !== 0) {

                    reject(new Error("swirlnet-solver-async: error: worker quit with exit code: " + code + " and signal: " + signal));
                }
            });

            if (!worker.isConnected()) {
                reject(new Error("swirlnet-solver-async: error: worker is disconnected."));
            }

        } catch (error) {
            reject(error);
        }
    };

    launchNextTask = function (worker, resolve, reject) {

        var genomeIndex, phenotype;

        genomeIndex = genomeIndexQueue.pop();

        setListeners(worker, genomeIndex, resolve, reject);

        if (genomeIndex !== undefined) {

            worker.send({"testFile": options.testFile, "genome": genomes[genomeIndex], "options": options.testFunctionOptions});

        } else {
            resolve();
        }
    };

    return Promise.resolve().then(init).then(launchInitialTasks);
};


createWorkerArray = function (workerCount) {

    "use strict";

    var i, workerArray;

    workerArray = [];

    for (i = 0; i < workerCount; i += 1) {

        /*jslint nomen: true*/
        workerArray.push(littleFork(path.join(__dirname, "worker.js")));
        /*jslint nomen: false*/
    }

    return workerArray;
};


killAllWorkers = function (workerArray) {

    "use strict";

    workerArray.map(function (worker) {
        worker.kill();
    });
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

