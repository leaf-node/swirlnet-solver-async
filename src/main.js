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


var swirlnet, swirlnetSolver;

swirlnet = require('swirlnet');

// search for network solution using user supplied Promise based test callback
swirlnetSolver = function (inputCount, outputCount, testFunction, maxSimulationDuration, genomeSettings, fitnessTarget, maxGenerations, doNoveltySearch) {

    "use strict";

    var mainLoop, population, archive, generationNumber,
        bestFitnessThisGeneration, bestPhenotypeThisGeneration;

    population = swirlnet.makePopulation(inputCount, outputCount, genomeSettings);

    if (doNoveltySearch === true) {
        archive = swirlnet.makeArchive(15, 6);
    }

    generationNumber = 0;

    mainLoop = function () {

        var genomes, fitnesses, simulationPre, simulationPost;

        simulationPre = new Date();

        genomes = population.getGenomes();

        fitnesses = [];

        return genomes.reduce(function (promiseSequence, genome) {

            return promiseSequence.then(function () {

                var phenotype, net, resultsPromise;

                phenotype = swirlnet.genoToPheno(genome);
                net = swirlnet.makeNet(phenotype);

                resultsPromise = testFunction(net, maxSimulationDuration, false);

                return resultsPromise.then(function (result) {

                    fitnesses.push(result.fitness);
                    if (doNoveltySearch === true) {
                        archive.noteBehavior(result.behavior, genome);
                    }
                });
            });

        }, Promise.resolve()).then(function () {

            var i, fittestGenomeIndex, sparsities, uniqueCount,
                sparsitiesPre, sparsitiesPost;

            simulationPost = new Date();

            bestFitnessThisGeneration = -1;

            if (doNoveltySearch === true) {
                sparsitiesPre = new Date();
                sparsities = archive.getSparsities();
                sparsitiesPost = new Date();
            }

            for (i = 0; i < fitnesses.length; i += 1) {

                if (doNoveltySearch === true) {
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

            if (doNoveltySearch === true) {
                archive.archiveAndClear();

                uniqueCount = archive.getArchiveLength();
            }

            if (doNoveltySearch === true) {
                console.log("generation: " + (generationNumber + 1) + "  uniques: " + uniqueCount + "  best fitness: " + bestFitnessThisGeneration);
            } else {
                console.log("generation: " + (generationNumber + 1) + "  best fitness: " + bestFitnessThisGeneration);
            }
            console.log();
            console.log(bestPhenotypeThisGeneration);
            console.log();
            console.log("simulation step took " + (simulationPost - simulationPre) / 1000 + " seconds.");
            if (doNoveltySearch === true) {
                console.log("sparsities step took " + (sparsitiesPost - sparsitiesPre) / 1000 + " seconds.");
            }
            console.log();

            if (bestFitnessThisGeneration > fitnessTarget) {

                console.log();
                console.log("winner found in " + (generationNumber + 1) + " generations after " + uniqueCount + " uniques, with fitness: " + bestFitnessThisGeneration);
                console.log();
                console.log("winning network:");
                console.log();
                console.log(bestPhenotypeThisGeneration);
                console.log();

                // winner found
                return true;
            }

            generationNumber += 1;

            if (generationNumber < maxGenerations) {

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
            console.log("no winner found in " + maxGenerations + " generations. last generation's best fitness: " + bestFitnessThisGeneration);
            console.log();
            console.log(bestPhenotypeThisGeneration);
            console.log();
        }
    });
};

module.exports = swirlnetSolver;

