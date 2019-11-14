# Geesome ETH manager
Library for custom Geesome modules, that listen Ethereum contracts for user registration with their ethereum addresses. 
After registration - users will be able to authorize in Geesome node by MetaMask and ethereum signature.

## Example
You can deploy Smart Contract for buy storage space for example. When user makes the transaction - this module will catch the event and register user.
Also by Smart Contract events you can change storage limits for users and etc.

```
const GeesomeEthManager = require('geesome-eth-manager');
const ChainService = require("geesome-eth-manager/chainService");
const databaseService = require('geesome-eth-manager/database');

const { GeesomeClient } = require('geesome-libs/src/GeesomeClient');

const axios = require("axios");
const pIteration = require("p-iteration");

(async () => {
  const geesomeClient = new GeesomeClient({
      server: 'http://localhost:7711', // api address of GeeSome node
      apiKey: 'BWBWEGC-ZZA4DZW-QEG8HFW-GYS1KVA' // api key of admin user in GeeSome node
  });

  await geesomeClient.init();
  
  const database = await databaseService({
    name: process.env.DATABASE_NAME || 'geesome_eth_manager'
  });

  const chainService = new ChainService(process.env.RPC_SERVER || 'ws://localhost:8546');

  chainService.onReconnect(fetchAndSubscribe);

  const geesomeEthManager = new GeesomeEthManager(database, chainService, geesomeClient);
  
  await fetchAndSubscribe(false);

  setInterval(() => {
    chainService.getCurrentBlock();
  }, 30 * 1000);

  async function fetchAndSubscribe() {
    let prevBlockNumber = parseInt(await database.getValue('lastBlockNumber')) || 0;
    const currentBlockNumber = await chainService.getCurrentBlock();
    
    // Your deployed contract with abi
    const contract = chainService.createContract('myContract', '0xecb69875c977b2072f60995dcf46a32386d1efdb', [{"name":"buyStorage","inputs":[{"name":"_storageRecipient","type":"address"}],"outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function","signature":"0x8119c065"},{"anonymous":false,"inputs":[{"indexed":false,"name":"storageRecipient","type":"uint256"}],"name":"Buy","type":"event","signature":"0x77f92a1b6a1a11de8ca49515ad4c1fad45632dd3442167d74b90b304a3c7a758"}]);

    async function handleBuyStorageEvent(event) {
      return geesomeEthManager.registerUserOperation(event.returnValues.storageRecipient);
    }
    
    await chainService.getEventsFromBlock(contract, 'Buy', prevBlockNumber).then(async (events) => {
      await pIteration.forEach(events, handleBuyStorageEvent);
    });

    chainService.subscribeForNewEvents(contract, 'Buy', currentBlockNumber, async (err, newEvent) => {
      console.log('🛎 New Buy event, blockNumber:', currentBlockNumber);
      await database.setValue('lastBlockNumber', currentBlockNumber.toString());
      await handleBuyStorageEvent(newEvent);
    });
  }
});
```
