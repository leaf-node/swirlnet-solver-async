#! /usr/bin/env node

// Created 2016 by Andrew Engelbrecht
//
// This demo file is licensed under Creative Commons CC0 1.0 Universal
//
//     https://creativecommons.org/publicdomain/zero/1.0/
//     https://creativecommons.org/publicdomain/zero/1.0/legalcode
//


var swirlnetSolverAsync, testFunction, os, path, solve;

//swirlnetSolverAsync = require('swirlnet-solver-async');
swirlnetSolverAsync = require('../src/main.js');

testFunction = require('./tester.js');

os = require('os');
path = require('path');

solve = function () {

    "use strict";

    var netSolveOptions, genomeSettings, doNoveltySearch;

    genomeSettings = {

        "populationSize":               150,
    };

    doNoveltySearch = false;

    netSolveOptions = {};
    netSolveOptions.inputCount = 2;
    netSolveOptions.outputCount = 1;

    netSolveOptions.genomeSettings = genomeSettings;

    netSolveOptions.fitnessTarget = 60;
    netSolveOptions.maxGenerations = 10000;
    netSolveOptions.doNoveltySearch = doNoveltySearch;

    netSolveOptions.useWorkers = true;
    //netSolveOptions.useWorkers = false;

    netSolveOptions.workerCount = os.cpus().length;
    /*jslint nomen: true*/
    netSolveOptions.testFile = path.join(__dirname, "./tester.js");
    /*jslint nomen: false*/

    //netSolveOptions.testFunction = require('./tester.js');;

    netSolveOptions.testFunctionOptions = {};
    netSolveOptions.testFunctionOptions.foo = true;
    netSolveOptions.testFunctionOptions.bar = 3;

    //netSolveOptions.noveltySearchOptions = {};
    //netSolveOptions.noveltySearchOptions.kNearestNeighbors = 15;
    //netSolveOptions.noveltySearchOptions.archiveThreshold = 6;
    //netSolveOptions.noveltySearchOptions.maxArchiveSize = 400;


    return swirlnetSolverAsync(netSolveOptions);
};

solve().catch(function (error) {

    "use strict";

    if (error.stack !== undefined) {
        console.log(error.stack);
    } else {
        console.log(error);
    }
    process.exit(1);
});

