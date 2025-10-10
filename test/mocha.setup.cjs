// Don't silently swallow unhandled rejections
process.on('unhandledRejection', (e) => {
    throw e;
});

// enable the should interface with sinon
// and load chai-as-promised and sinon-chai by default
const chai = require('chai');
const sinonChai = require('sinon-chai').default;
const chaiAsPromised = require('chai-as-promised').default;

chai.should();
chai.use(sinonChai);
chai.use(chaiAsPromised);

global.expect = chai.expect;