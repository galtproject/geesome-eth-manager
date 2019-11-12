/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import OperationsQueue from "./operationsQueue";

const xkcdPassword = require('xkcd-password')();
const _ = require("lodash");

export default class GeesomeEthManager {
  operationsQueue;
  
  constructor(
    public database, 
    public chainService, 
    public geesomeClient
  ) {
    this.operationsQueue = new OperationsQueue();
  }
  
  async registerUser(userAddress, userData: any = {}) {
    console.log('registerUser', userAddress);
    userAddress = userAddress.toLowerCase();
    
    const existLog = await this.database.getLog('registerUser', userAddress);
    if(existLog) {
      console.log('user', userAddress, 'already registered, found in logs');
      return;
    }

    const existAccount = await this.geesomeClient.adminGetUserAccount('ethereum', userAddress);
    if(existAccount) {
      console.log('user', userAddress, 'already registered, found in geesome');
      await this.database.addLog('registerUser', userAddress);
      return;
    }

    if(!userData.name) {
      const secretKey = (await xkcdPassword.generate({numWords: 2, minLength: 5, maxLength: 8})).map(s => _.upperFirst(s)).join(' ');
      const cutAddress = userAddress.slice(0, 7) + "..." + userAddress.slice(-4);
      userData.name = secretKey + " " + cutAddress;
    }
    
    await this.geesomeClient.adminCreateUser({
      name: userData.name,
      accounts: [{provider: 'ethereum', address: userAddress}],
      ...userData
    });
    
    return this.database.addLog('registerUser', userAddress);
  }
  
  async registerUserOperation(userAddress, userData: any = {}) {
    this.operationsQueue.addOperation(async () => {
      return this.registerUser(userAddress, userData);
    });
  }
}
