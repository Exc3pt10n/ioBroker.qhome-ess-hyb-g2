"use strict";

// Don't silently swallow unhandled rejections
process.on("unhandledRejection", (e) => {
  throw e;
});

// enable the should interface with sinon
// and load chai-as-promised and sinon-chai by default
const sinonChaiModule = require("sinon-chai");
const sinonChai = sinonChaiModule.default || sinonChaiModule;
const chaiAsPromisedModule = require("chai-as-promised");
const chaiAsPromised = chaiAsPromisedModule.default || chaiAsPromisedModule;
const { should, use } = require("chai");

should();
use(sinonChai);
use(chaiAsPromised);
