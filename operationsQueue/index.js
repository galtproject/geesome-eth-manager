

/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

module.exports = class OperationsQueue {
  constructor() {
    this.queue = [];
    this.active = false;
  }
  
  addOperation(callback) {
    this.queue.push(callback);
    
    if(!this.active) {
      this.run();
    }
  }

  run() {
    if (!this.queue.length) {
      this.active = false;
      console.log('OperationsQueue finished, waiting for new one...');
      return;
    }
    this.active = true;
    const callback = this.queue.shift();
    
    const callbackResult = callback();
    if(callbackResult && callbackResult.then) {
      callbackResult.catch((e) => {console.error(e)}).then(() => this.run());
    } else {
      this.run();
    }
  }
};
