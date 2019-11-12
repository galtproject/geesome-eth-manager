/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

const _ = require('lodash');

const Web3 = require("web3");
const Web3Utils = require("web3-utils");

module.exports = class ChainService {

  constructor(_wsServer) {
    this.wsServer = _wsServer;
    this.websocketProvider = new Web3.providers.WebsocketProvider(this.wsServer);
    this.web3 = new Web3(this.websocketProvider);

    this.subscribeForReconnect();

    this.contractList = [];
    this.contractsByAddress = {};

    this.redeployed = false;
  }

  getEventsFromBlock(contract, eventName, blockNumber = null) {
    if(!contract) {
      console.log(`✖️ Event ${eventName} getting events ignored, contract not found`);
      return new Promise((resolve) => resolve([]));
    }
    return contract.getPastEvents(eventName, {fromBlock: blockNumber}).then(events => {
      console.log(`✅️ Event ${eventName} got ${events.length} items, by contract ${contract._address}`);
      return events.map(e => {
        e.contractAddress = e.address;
        return e;
      })
    });
  }

  subscribeForNewEvents(contract, eventName, blockNumber, callback) {
    if(!contract) {
      console.log(`✖️ Event ${eventName} subscribing ignored, contract not found`);
      return;
    }
    console.log(`✅️ Event ${eventName} subscribed, by contract ${contract._address}`);
    
    contract.events[eventName]({fromBlock: blockNumber}, (error, e) => {
      if(e) {
        e.contractAddress = e.address;
      }
      callback(error, e);
    });
  }

  async getCurrentBlock() {
    return this.web3.eth.getBlockNumber();
  }

  onReconnect(callback) {
    this.callbackOnReconnect = callback;
  }

  subscribeForReconnect() {
    this.websocketProvider.on('end', () => {
      setTimeout(() => {
        console.log(new Date().toISOString().slice(0, 19).replace('T', ' '), '🔁 Websocket reconnect');

        this.websocketProvider = new Web3.providers.WebsocketProvider(this.wsServer);
        this.web3 = new Web3(this.websocketProvider);
        // this.reinitContracts();

        if (this.callbackOnReconnect) {
          this.callbackOnReconnect(this.redeployed);
          this.redeployed = false;
        }

        this.subscribeForReconnect();
      }, 1000);
    });
  }

  createContract(name, address, abi) {
    address = address.toLowerCase();
    
    this.contractList.push({
      name,
      address,
      abi
    });
    
    this.contractsByAddress[address] = new this.web3.eth.Contract(abi, address);
    
    console.log(`✅️ Contract ${name} successfully init by address: ${address}`);
    return this.contractsByAddress[address];
  }
  
  // reinitContracts() {
  //   this.contractList.forEach()
  // }
  
  async getContractSymbol(address) {
    const contract = new this.web3.eth.Contract([{"constant":true,"inputs":[],"name":"_symbol","outputs":[{"name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function","signature":"0xb09f1266"},{"constant":true,"inputs":[],"name":"symbol","outputs":[{"name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"}], address);
    // console.log(this.contractsConfig['spaceLockerAbi']);
    return contract.methods.symbol().call({})
      .catch(() => 
        contract.methods._symbol().call({}).catch(() => null)
      );
  }

  async callContractMethod(contract, methodName, args) {
    return contract.methods[methodName].apply(contract, args).call({});
  }
}
