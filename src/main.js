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

var swirlnet, util, swirlnetSolver,
    testOptions, sequentialTest,
    logProgress, testForWinner;

swirlnet = require('swirlnet');
util = require('./util.js');

// search for network solution using user supplied Promise based test callback
swirlnetSolver = function (options) {

    "use strict";

    var mainLoop, population, archive, generationNumber,
        bestFitnessThisGeneration, bestPhenotypeThisGeneration;

    testOptions(options);

    population = swirlnet.makePopulation(options.inputCount, options.outputCount, options.genomeSettings || {});

    if (options.doNoveltySearch === true) {
        archive = swirlnet.makeArchive(15, 6);
    }

    generationNumber = 0;

    mainLoop = function () {

        var genomes, simulationPre, simulationPost;

        simulationPre = new Date();

        genomes = population.getGenomes();

        return sequentialTest(genomes, options, archive).then(function (fitnesses) {

            var i, fittestGenomeIndex, sparsities, uniqueCount,
                sparsitiesPre, sparsitiesPost, isWinnerFound;

            simulationPost = new Date();

            bestFitnessThisGeneration = -1;

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

                if (fitnesses[i] > bestFitnessThisGeneration) {

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

    console.assert(typeof options.useWorkers === "boolean", "swirlnet-solver-async: error: useWorkers option must be a boolean");

    if (options.useWorkers) {
        console.assert(typeof options.worker === "string", "swirlnet-solver-async: error: worker option must be an string");
        console.assert(util.isInt(options.workerCount) && options.workerCount > 0, "swirlnet-solver-async: error: workerCount option must be a positive integer");
    } else {
        console.assert(typeof options.testFunction === "function", "swirlnet-solver-async: error: testFunction option must be an function");
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


logProgress = function (generationNumber, bestFitnessThisGeneration, bestPhenotypeThisGeneration, simTime, uniqueCount, sparsitiesTime) {

    "use strict";

    if (uniqueCount !== undefined) {
        console.log("generation: " + (generationNumber + 1) + "  uniques: " + uniqueCount + "  best fitness: " + bestFitnessThisGeneration);
    } else {
        console.log("generation: " + (generationNumber + 1) + "  best fitness: " + bestFitnessThisGeneration);
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

    if (bestFitnessThisGeneration > fitnessTarget) {

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

