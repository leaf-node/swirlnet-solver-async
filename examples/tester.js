
// Created 2016 by Andrew Engelbrecht
//
// This demo file is licensed under Creative Commons CC0 1.0 Universal
//
//     https://creativecommons.org/publicdomain/zero/1.0/
//     https://creativecommons.org/publicdomain/zero/1.0/legalcode
//


/*global Promise */

var testFunction;

testFunction = function (net, options) {

    "use strict";

    var i, outputs;

    net.flush();
    outputs = [];

    for (i = 0; i < 100; i += 1) {

        // insert your tester code here

        net.setInputs([1,-1]);
        net.step();
        outputs.push(net.getOutputs()[0]);
    }

    if (options.calculateBehavior) {
        return Promise.resolve({"fitness": outputs[99], "behavior": outputs});
    }
    return Promise.resolve({"fitness": outputs[99]});
};

module.exports = testFunction;

