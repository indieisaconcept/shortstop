/***@@@ BEGIN LICENSE @@@***/
/*───────────────────────────────────────────────────────────────────────────*\
│  Copyright (C) 2013 eBay Software Foundation                                │
│                                                                             │
│hh ,'""`.                                                                    │
│  / _  _ \  Licensed under the Apache License, Version 2.0 (the "License");  │
│  |(@)(@)|  you may not use this file except in compliance with the License. │
│  )  __  (  You may obtain a copy of the License at                          │
│ /,'))((`.\                                                                  │
│(( ((  )) ))    http://www.apache.org/licenses/LICENSE-2.0                   │
│ `\ `)(' /'                                                                  │
│                                                                             │
│   Unless required by applicable law or agreed to in writing, software       │
│   distributed under the License is distributed on an "AS IS" BASIS,         │
│   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.  │
│   See the License for the specific language governing permissions and       │
│   limitations under the License.                                            │
\*───────────────────────────────────────────────────────────────────────────*/
/***@@@ END LICENSE @@@***/
'use strict';

var util = require('core-util-is'),

    regex = (function () {

        var match = {
            begin: '^([\da-z\.-]+):',
            protocol: '^({}):',
            chained: '\\|(?=(?:[\da-z\.-]+):)'
        };

        return function (rx, value) {
            var regex = match[rx].replace('{}', value);
            return new RegExp(regex);
        };
    }());

exports.create = function (parent) {

    var handlers = Object.create(null);

    return {

        get _handlers() {
            return handlers;
        },

        use: function (protocol, filter, impl) {
            var handlers, handler, index, removed, protocols, rx;

            impl = util.isFunction(filter) ? filter : impl;

            protocols = util.isArray(filter) ? [protocol].concat(filter) : [protocol];
            handlers = this._handlers;
            handler = handlers[protocol];

            if (!handler) {
                rx = util.isString(filter) ? new RegExp(filter.replace('{protocol}', protocol)) : regex('protocol', protocols.join('|'));

                handler = handlers[protocol] = {

                    protocol: protocol,

                    regex: rx,

                    predicate: function (value) {
                        return this.regex.test(value);
                    },

                    stack: []

                };
            }

            index = handler.stack.push(impl);
            removed = false;

            // Unuse
            return function () {
                if (!removed) {
                    removed = true;
                    return handler.stack.splice(index - 1, 1)[0];
                }
                return undefined;
            };
        },

        getStack: function (protocol) {
            var currentStack, parentStack, hasParent;

            currentStack = this._handlers[protocol] && this._handlers[protocol].stack;
            parentStack = parent && parent.getStack(protocol);
            hasParent = parentStack && parentStack.length;

            if (currentStack && hasParent) {
                return currentStack.concat(parentStack);
            }

            if (hasParent) {
                return parentStack;
            }

            return currentStack;
        },

        resolve: function resolve(src) {
            var self, srcs, chain, valid, protocols, dest, previousDest, handlers;

            self = this;
            dest = src;

            if (util.isObject(src) && src !== null) {

                dest = (Array.isArray(src) ? [] : Object.create(Object.getPrototypeOf(src)));
                Object.keys(src).forEach(function (key) {
                    dest[key] = this.resolve(src[key]);
                }, self);

            } else if (util.isString(src)) {

                handlers = this._handlers;

                protocols = Object.keys(handlers).join('|');
                valid = regex('begin');

                if (valid.test(src)) {

                    chain = regex('chained', protocols);
                    srcs = src.split(chain);

                    srcs.forEach(function (src) {

                        Object.keys(handlers).forEach(function (protocol) {

                            var handler = handlers[protocol];

                            if (handler.predicate(src)) {
                                // run through stack and mutate
                                dest = src.slice(protocol.length + 1);
                                this.getStack(protocol).forEach(function (handler) {
                                    dest = handler.call({
                                        protocol: src.substr(0, src.indexOf(':'))
                                    }, dest, previousDest);
                                });
                            }
                        }, self);

                        previousDest = dest;

                    });

                }

            }

            return dest;
        }

    };
};