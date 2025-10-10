const chai = require('chai');

// ESM-kompatible Plugins brauchen `.default`:
const sinonChai = require('sinon-chai').default;
const chaiAsPromised = require('chai-as-promised').default;

chai.should();
chai.use(sinonChai);
chai.use(chaiAsPromised);

global.expect = chai.expect;

process.on('unhandledRejection', (e) => {
  throw e;
});