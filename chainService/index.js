/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

const _ = require('lodash');
const log = require('../logService');

const Web3 = require("web3");
const Web3Utils = require("web3-utils");

const toBN = Web3Utils.toBN;
const isIPFS = require('is-ipfs');
const bs58 = require('bs58');

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

  getEventsFromBlock(contract, eventName, blockNumber = null, filter = null) {
    if (!contract) {
      log(`✖️ Event ${eventName} getting events ignored, contract not found`);
      return new Promise((resolve) => resolve([]));
    }
    if (!contract.events[eventName]) {
      log(`✖️ Event ${eventName} getting events ignored, event not found`);
      return new Promise((resolve) => resolve([]));
    }
    return contract.getPastEvents(eventName, {fromBlock: blockNumber, filter}).then(events => {
      log(`✅️ Event ${eventName} got ${events.length} items, by contract ${contract._address}`);
      return events.map(e => {
        e.contractAddress = e.address;
        return e;
      })
    });
  }

  subscribeForNewEvents(contract, eventName, blockNumber, callback) {
    if (!contract) {
      log(`✖️ Event ${eventName} subscribing ignored, contract not found`);
      return;
    }
    if (!contract.events[eventName]) {
      log(`✖️ Event ${eventName} subscribing ignored, event not found`);
      return;
    }
    const contractAddress = contract._address.toLowerCase();

    log(`✅️ Event ${eventName} subscribed, by contract ${contractAddress}`);

    contract.events[eventName]({fromBlock: blockNumber}, (error, e) => {
      if (error) {
        console.error('New event error', error);
        return callback(error, e);
      }
      this.getBlockTimestamp(e.blockNumber).then(blockTimestamp => {
        const blockDate = new Date();
        blockDate.setTime(parseInt(blockTimestamp) * 1000);
        log('🛎 New Event', eventName, 'block number:', e.blockNumber, 'block date:', blockDate.toISOString().slice(0, 19).replace('T', ' '));
      });
      if (e) {
        e.contractAddress = e.address;
      }
      // delay for ethereum node to write new data from event to storage
      setTimeout(() => {
        const promise = callback(error, e);
        if(promise && promise.then) {
          promise.then(() => {
            this.onAfterNewEvent(e);
          })
        }
      }, 1000);
    });
  }

  async getCurrentBlock() {
    return this.web3.eth.getBlockNumber();
  }

  async getBlockTimestamp(blockNumber) {
    return new Promise(async (resolve, reject) => {
      const block = await this.web3.eth.getBlock(blockNumber);
      if (block) {
        resolve(block.timestamp);
      } else {
        log(`Failed to get ${blockNumber} block timestamp, try again...`)
        setTimeout(() => {
          resolve(this.getBlockTimestamp(blockNumber));
        }, 500);
      }
    });
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
    const contract = new this.web3.eth.Contract([{
      "constant": true,
      "inputs": [],
      "name": "_symbol",
      "outputs": [{"name": "", "type": "string"}],
      "payable": false,
      "stateMutability": "view",
      "type": "function",
      "signature": "0xb09f1266"
    }, {
      "constant": true,
      "inputs": [],
      "name": "symbol",
      "outputs": [{"name": "", "type": "string"}],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    }], address);
    // console.log(this.contractsConfig['spaceLockerAbi']);
    return contract.methods.symbol().call({})
      .catch(() =>
        contract.methods._symbol().call({}).catch(() => null)
      );
  }

  async callContractMethod(contract, methodName, args) {
    return contract.methods[methodName].apply(contract, args).call({});
  }

  getNetworkId() {
    return this.web3.eth.net.getId();
  }

  async getTransactionReceipt(txHash, abiAddressArr) {
    const receipt = await this.web3.eth.getTransactionReceipt(txHash);

    receipt.events = [];

    abiAddressArr.forEach(item => {
      const {abi, address} = item;
      if (!address) {
        return;
      }
      receipt.logs.filter(log => log.address.toLowerCase() === address.toLowerCase()).forEach((log) => {
        const eventObject = _.find(abi, (abiItem) => {
          if (!abiItem.signature) {
            abiItem.signature = this.getMethodSignature(abi, abiItem.name);
          }
          return abiItem.type === 'event' && log.topics[0] === abiItem.signature;
        });
        if (eventObject) {
          const values = this.web3.eth.abi.decodeLog(eventObject.inputs, log.data === '0x' ? null : log.data, log.topics.slice(1));
          receipt.events.push({
            ...eventObject,
            address,
            txHash,
            values
          })
        }
      });
    });

    return receipt;
  }

  async getTransactionArgs(txHash, abi) {
    const tx = await this.web3.eth.getTransaction(txHash);
    const {inputs} = this.parseData(tx.input, abi);
    return inputs;
  }

  getMethodSignature(abi, methodName) {
    let signature = null;
    abi.some(method => {
      if (method.name === methodName) {
        signature = method.signature;
        if (!signature) {
          signature = this.web3.eth.abi.encodeFunctionSignature(method);
        }
        return true;
      }
      return false;
    });
    return signature;
  }

  parseData(data, abi, decimals) {
    const methodSignature = data.slice(0, 10);
    if (methodSignature === '0x00000000') {
      return null;
    }

    const methodAbi = _.find(abi, (abiItem) => {
      let abiSignature = abiItem.signature;
      if (abiItem.type === 'fallback') {
        return false;
      }
      if (!abiSignature) {
        try {
          abiSignature = this.web3.eth.abi.encodeFunctionSignature(abiItem);
        } catch (e) {
          console.error('[EthData.parseData.encodeFunctionSignature]', abiItem, e);
        }
      }
      return abiSignature && abiSignature === methodSignature;
    });
    if (!methodAbi) {
      return {
        methodSignature
      };
    }
    const methodName = methodAbi.name;

    let decoded = {};
    if (data.slice(10)) {
      decoded = this.web3.eth.abi.decodeParameters(methodAbi.inputs, '0x' + data.slice(10));
    }

    const sourceInputs = {};
    const inputs = {};
    const inputsStr = {};
    const inputsFields = [];
    const inputsDetails = {};

    methodAbi.inputs.forEach((inputAbi) => {
      let {name} = inputAbi;
      let value = decoded[name];
      sourceInputs[name] = value;
      sourceInputs[_.trim(name, '-_')] = value;

      let valueDecimals = decimals;
      if (_.isUndefined(valueDecimals) || valueDecimals === null) {
        if (_.includes(inputAbi.type, 'int256[]') && this.isNumberLargerThenDecimals(value[0], 15)) {
          valueDecimals = 18;
        } else if (_.includes(inputAbi.type, 'int256') && this.isNumberLargerThenDecimals(value, 15)) {
          valueDecimals = 18;
        } else {
          valueDecimals = 0;
        }
      }
      inputsDetails[name] = {
        type: inputAbi.type,
        decimals: valueDecimals
      };


      if (_.includes(inputAbi.type, 'int256[]')) {
        value = value.map(valItem => {
          return this.weiToDecimals(valItem, valueDecimals);
        });
      } else if (_.includes(inputAbi.type, 'int256')) {
        value = this.weiToDecimals(value, valueDecimals);
      }

      inputs[name] = value;
      inputs[_.trim(name, '-_')] = value;
      inputsFields.push(name);
    });

    return {
      methodSignature,
      methodAbi,
      methodName,
      sourceInputs,
      inputs,
      inputsFields,
      inputsDetails
    };
  }

  isNumberLargerThenDecimals(number, decimals) {
    return toBN(number.toString(10), 10).gt(toBN((10 ** decimals).toString(10), 10));
  }

  weiToDecimals(wei, decimals) {
    const zero = toBN(0);
    const negative1 = toBN(-1);

    const negative = toBN(wei.toString(10), 10).lt(zero); // eslint-disable-line
    const baseLength = (10 ** decimals).toString().length - 1 || 1;
    const decimalsBN = toBN((10 ** decimals).toString(10), 10);

    if (negative) {
      wei = toBN(wei.toString(10), 10).mul(negative1);
    }

    let fraction = toBN(wei.toString(10), 10).mod(decimalsBN).toString(10); // eslint-disable-line
    // fraction = trim(fraction, '0');

    while (fraction.length < baseLength) {
      fraction = '0' + fraction;
    }

    // if (!options.pad) {
    fraction = fraction.match(/^([0-9]*[1-9]|0)(0*)/)[1];
    // }

    const whole = toBN(wei.toString(10), 10).div(decimalsBN).toString(10); // eslint-disable-line

    // if (options.commify) {
    //     whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    // }

    let value = '' + whole + (fraction == '0' ? '' : '.' + fraction); // eslint-disable-line

    if (negative) {
      value = '-' + value;
    }

    return _.trim(value, '.');
  }

  stringToHex(string) {
    return Web3Utils.utf8ToHex(string)
  }

  hexToString(hex) {
    if (!hex) {
      return "";
    }
    try {
      return Web3Utils.hexToUtf8(hex);
    } catch (e) {
      // most possible this is ipfs hash
      if (hex.length == 66) {
        if (typeof hex !== "string") {
          throw new TypeError("bytes32 should be a string");
        }

        if (hex === "") {
          throw new TypeError("bytes32 shouldn't be empty");
        }

        if (hex.length !== 66) {
          throw new TypeError("bytes32 should have exactly 66 symbols (with 0x)");
        }

        if (!(hex.startsWith("0x") || hex.startsWith("0X"))) {
          throw new TypeError("bytes32 hash should start with '0x'");
        }

        const hexString = "1220" + hex.substr(2);
        const bytes = Buffer.from(hexString, 'hex');

        const ipfsHash = bs58.encode(bytes);
        if (isIPFS.multihash(ipfsHash)) {
          return ipfsHash;
        }
      }
      return null;
    }
  }
}
