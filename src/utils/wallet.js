/*
  This library handles all the wallet functionality.
*/

"use strict"

module.exports = {
  generateWallet,
  consolidateUTXOs, // Consolidate up to 20 spendable UTXOs
  spend, // Send coin to an address.
  getBalance,
  broadcast,
  decode,
  utxos
}

// Inspect utility used for debugging.
const util = require("util")
util.inspect.defaultOptions = {
  showHidden: true,
  colors: true,
  depth: 1
}

const request = require('request');
const bsvMnemonic = require('bsv-mnemonic')
const bsv = require('bsv')

//const BB = require("bitbox-sdk/lib/bitbox-sdk").default
//const BITBOX = new BB({ restURL: `https://trest.bitcoin.com/v1/` })
// const BITBOX = new BB({ restURL: `http://localhost:3000/v1/` })
// const BITBOX = new BB({ restURL: `http://decatur.hopto.org:3003/v1/` })
//const BITBOX = new BB({ restURL: `http://192.168.0.13:3003/v1/` })

const walletInfo = require(`../../wallet.json`)
const faucetAddress = walletInfo.legacyAddress
const isNodeWallet = faucetAddress === "mgEWZ3FjNvWCswzLikjGMijsdvdV1kxzo6"

const CONSOLIDATE_MAX = 20

//generate a wallet and deposit address
async function generateWallet() {
  const mnemonic = new bsvMnemonic(bsvMnemonic.Words.English);
  const xpriv = mnemonic.toHDPrivateKey();
  const bsvpk = new bsv.HDPrivateKey(xpriv);
  const hdPublicKey = bsvpk.hdPublicKey;
  const address = new bsv.Address(hdPublicKey.derive(1).publicKey, bsv.Networks.testnet);
  return {mnemonic:mnemonic.toString(), address:address.toLegacyAddress()}
}

//get faucet wallet balance
async function getBalance() {
  // const mnemonic = walletInfo.mnemonic
  // const rootSeed = BITBOX.Mnemonic.toSeed(mnemonic)
  // const masterHDNode = BITBOX.HDNode.fromSeed(rootSeed, "testnet")
  // const account = BITBOX.HDNode.derivePath(masterHDNode, "m/44'/145'/0'")
  // const change = BITBOX.HDNode.derivePath(account, "0/0")
  // const cashAddress = BITBOX.HDNode.toCashAddress(change)
  // const balanceObj = await BITBOX.Address.details([cashAddress])
  // const balance = balanceObj[0].balance
  const rpc = await noderpc(rpcCommand("getbalance", []))
  //console.log(rpc)
  let jrpc = JSON.parse(rpc)
  const balance = jrpc["result"]
  console.log(`faucet balance: ${balance}`)
  return balance
}

//consoldate wallet utxo
async function consolidateUTXOs() {
  try {
    const bsvpk = getPrivateKey();

    // HDNode of BIP44 account
    //const account = BITBOX.HDNode.derivePath(masterHDNode, "m/44'/145'/0'")

    const change = faucetAddress; //BITBOX.HDNode.derivePath(account, "0/0")

    const transactionBuilder = new bsv.Transaction()

    // Combine all the utxos into the inputs of the TX.
    const u = await faucetWalletUtxos(); //await BITBOX.Address.utxo([cashAddress])
    const inputs = []
    let originalAmount = 0

    console.log(`Number of UTXOs: ${u[0].length}`)

    for (let i = 0; i < u[0].length; i++) {
      const thisUtxo = u[0][i]
      // Most UTXOs will come from mining rewards, so we need to wait 100
      // confirmations before we spend them.
      if (thisUtxo.confirmations > 100) {
        originalAmount = originalAmount + getAmount(thisUtxo)
        inputs.push(thisUtxo)
      }
      if (inputs.length >= CONSOLIDATE_MAX) break
    }

    // amount to send to receiver. It's the original amount - 1 sat/byte for tx size
    const sendAmount = originalAmount - bsv.Transaction.DUST_AMOUNT;//byteCount
    // console.log(`sendAmount: ${sendAmount}`)

    if (sendAmount < 0) {
      console.log(`sendAmount is negative, aborting UTXO consolidation.`)
      return
    }

    transactionBuilder.from(inputs)
    transactionBuilder.to(change, sendAmount)
    transactionBuilder.fee(bsv.Transaction.DUST_AMOUNT);

    const tx = signTx(transactionBuilder, bsvpk);

    const hex = tx.serialize()
    console.log(`fee = ${tx.getFee()}`)
    // console.log(`TX Hex: ${hex}`)

    // const broadcastResult = await broadcast(hex)
    // console.log(`\nConsolidating UTXOs. Transaction ID: ${broadcastResult}`)
  } catch (err) {
    console.log(`Error in consolidateUTXOs: `, err)
  }
}

//There are two types of private keys that can be supported
//Pk from bitcoind or HD wallet
function getPrivateKey() {
  var bsvpk;
  if (walletInfo.wif) {
    console.log(`using wif ${walletInfo.wif}`)
    bsvpk = bsv.PrivateKey(walletInfo.wif)
  } else {
    // root seed buffer
    //const rootSeed = BITBOX.Mnemonic.toSeed(mnemonic)
    console.log(`using mnemonic ${walletInfo.mnemonic}`)
    const rootSeed = new bsvMnemonic(walletInfo.mnemonic)

    //master HDNode
    //const masterHDNode = BITBOX.HDNode.fromSeed(rootSeed, "testnet")
    const masterHDNode = rootSeed.toHDPrivateKey();
    bsvpk = new bsv.HDPrivateKey(masterHDNode);
    //bsvpk = bsvpk.privateKey;
  }
  // HDNode of BIP44 account
  //const account = BITBOX.HDNode.derivePath(masterHDNode, "m/44'/145'/0'")
  //const account = new bsv.Address(bsvpk.hdPublicKey.publicKey, bsv.Networks.testnet)
  return bsvpk;
}

// Send BSV to an address. Address should be a testnet address in "legacy" format (not ABC cashaddr)
async function spend(bsvAddress, amount) {
  try {
    const sendToAddress = new bsv.Address.fromString(bsvAddress)
    // Exit if not a valid testnet address.
    const isValid = validateAddress(bsvAddress)
    if (!isValid) {
      console.log('wallet:spend: invalid bsv testnet address')
      return false
    }

    const bsvpk = getPrivateKey();

    //const change = BITBOX.HDNode.derivePath(account, "0/0")
    const change = faucetAddress

    // Get the biggest UTXO, which is assumed to be spendable.
    //const u = await BITBOX.Address.utxo([faucetCashAddress])
    //TODO: until we have insight for testnet, hard code the utxo
    //find utxo from explore.satoshisvision.network
    //blocks 1275065,066,074,...
    const u = await faucetWalletUtxos();
    console.log(`Number of UTXOs: ${u[0].length}`)
    let utxo;
    if (isNodeWallet) {
      utxo = findBiggestUtxo(u[0])
    } else {
      utxo = u[0][0]
    }

    if (!utxo) {
      throw "faucet is dry"
    }

    const transactionBuilder = new bsv.Transaction()

    const vout = utxo.vout
    const txid = utxo.txid

    console.log(utxo);
    transactionBuilder.from(utxo)

    const txFee = bsv.Transaction.DUST_AMOUNT;
    // amount to send back to the sending address. It's the original amount - 1 sat/byte for tx size
    // Amount to send in satoshis, defaults to .1
    const enforced_max = Math.min(70000000, toSatoshis(amount))
    console.log(`enforced max amount ${enforced_max}`);
    const AMOUNT_TO_SEND = enforced_max
    const satoshisToSend = AMOUNT_TO_SEND
    const originalAmount = utxo.satoshis
    const remainder = originalAmount - satoshisToSend - txFee

    // add output w/ address and amount to send
    //transactionBuilder.addOutput(faucetCashAddress, remainder)
    // transactionBuilder.addOutput(
    //   BITBOX.Address.toLegacyAddress(bchAddr), satoshisToSend
    // )
    transactionBuilder.to(bsvAddress, satoshisToSend)
    //is the change address index 0 or 1?
    transactionBuilder.change(change)
    transactionBuilder.fee(txFee)

    const tx = signTx(transactionBuilder, bsvpk);
    //if tx does not serialize then problem could be that utxo does not have enough amount!
    const hex = tx.serialize();
    console.log(hex);
    let txidSpend = getTxid(tx);
    console.log(`txid = ${txidSpend}`)
    console.log(`fee = ${tx.getFee()}`)

    const broadcastResult = await broadcast(hex)

    if (broadcastResult.length == 64) {
    //   console.log(`Transaction was Broadcast. Transaction ID: ${broadcastResult}`)
    //   //replace txid in the utxo list it so it can be spent by next user
    //   utxo["txid"] = broadcastResult
    //   utxo["satoshis"] = utxo["satoshis"] - remainder
    } else {
       console.log(`Error broadcasting: ${broadcastResult}`)
    }

    return broadcastResult
  } catch (err) {
    console.log(`Error in wallet.spend().`)
    throw err
  }
}

function signTx(transactionBuilder, bsvpk) {
  console.log(`signing with ${bsvpk}`);
  let tx;
  if (isNodeWallet) {
    tx = transactionBuilder.sign(bsvpk);
  } else {
    tx = transactionBuilder.sign(bsvpk.privateKey);
  }
  if (!tx.isFullySigned()) {
    console.error(`Tx IS NOT FULLY SIGNED`);
  } else {
    console.log(`Tx is fully signed`);
  }
  return tx;
}

function getTxid(tx) {
  const jsontx = tx.toObject();
  console.log(jsontx)
  console.log(jsontx["inputs"][0])
  console.log(jsontx["outputs"][0])
  console.log(jsontx["outputs"][1])
  let txidSpend = jsontx["hash"]
  return txidSpend;
}

async function broadcast(rawhex) {
  //const broadcastResult = await BITBOX.RawTransactions.sendRawTransaction(rawhex)
  //result should be txid if successful otherwise error message
  //
  let broadcastResult = ""

  try {
    console.log(rawhex)
    const rpc = await noderpc(rpcCommand("sendrawtransaction", [rawhex]))
    console.log('Post successful: response: ', rpc);
    const body = JSON.parse(rpc)
    if (body["result"]) {
      //if all good then return txid
      broadcastResult = body["result"]
    } else {
      console.log(body["error"])
      broadcastResult = JSON.stringify(body["error"])
    }
  } catch (error) {
    broadcastResult = error
    console.error(error);
  }

  return broadcastResult
}

async function decode(rawhex) {
  try {
    const tx = new bsv.Transaction(rawhex)
    return tx.toObject();
  } catch (error) {
    console.error(error);
    return error;
  }
}

// wrap a request in an promise. will return string
function noderpc(options) {
  return new Promise((resolve, reject) => {
      console.log(`calling noderpc ${options["body"]}`)
      request(options, (error, response, body) => {
          if (error) reject(error);
          // if (response.statusCode != 200) {
          //     reject('Invalid status code <' + response.statusCode + '>' + JSON.stringify(response));
          // }
          resolve(body);
      });  
  });
}

//compose bitcoin rpc command
//example: rpcCommand("sendrawtransaction", [rawhex])
function rpcCommand(command, paramsList) {
  // User and password specified like so: node index.js username password.
  let username = "fullcycle"
  let password = "mining"

  let options = {
    url: "http://localhost:18332",
    method: "post",
    headers:
    { 
     "content-type": "text/plain"
    },
    auth: {
        user: username,
        pass: password
    },
    body: JSON.stringify( {"jsonrpc": "1.0", "id": "bitcoind-rpc", "method": command, "params": paramsList })
  };
  //console.log(options);
  return options;
}

//get utxos of the faucet wallet
async function faucetWalletUtxos() {
  console.log(`isNodeWallet ${isNodeWallet}`)
  if (!isNodeWallet) {
    const utxoList = [[
//      {"txid":"34d85a226834db8dc90705963c9f3bad4b2763a721767331829135cb8f59bd85", "vout":0, "satoshis": 69025000, "address":faucetAddress, "scriptPubKey":"76a9140c1c92fe5492ce57e47c28c1e339c3c87779d2f188ac"},
//      {"txid":"a4e3daa9ed54eb1ad6ddb2a8c7f984667356adb7b57d8e7cc8028bb70c543af0", "vout":0, "satoshis": 78125000, "address":faucetAddress, "scriptPubKey":"76a9140c1c92fe5492ce57e47c28c1e339c3c87779d2f188ac"},
//      {"txid":"06cdfa9e35ef75a1e71f92d3a1f08b53b5f5505bae08ad7be83f61f3c16ab200", "vout":0, "satoshis": 78125000, "address":faucetAddress, "scriptPubKey":"76a9140c1c92fe5492ce57e47c28c1e339c3c87779d2f188ac"},
//      {"txid":"270108f3a25e1c892d97bddfed6cb1fab11224aa34e7f1ed6ef3e72f0ca89cbc", "vout":0, "satoshis": 78125000, "address":faucetAddress, "scriptPubKey":"76a9140c1c92fe5492ce57e47c28c1e339c3c87779d2f188ac"},
//      {"txid":"c95701b7a93baa36863840f665e5adb39a0cd4d8d1996c4f6438861bab7f8562", "vout":0, "satoshis": 78125000, "address":faucetAddress, "scriptPubKey":"76a9140c1c92fe5492ce57e47c28c1e339c3c87779d2f188ac"},
//      {"txid":"d92e4d5f339a3f5a8cb710caa01f2459aac78221f2102907f801fed8fd5d48b7", "vout":0, "satoshis": 78125000, "address":faucetAddress, "scriptPubKey":"76a9140c1c92fe5492ce57e47c28c1e339c3c87779d2f188ac"}
//this one says missing input?
//      {"txid":"06cdfa9e35ef75a1e71f92d3a1f08b53b5f5505bae08ad7be83f61f3c16ab200", "vout":0, "satoshis": 78125000, "address":faucetAddress, "scriptPubKey":"76a9140c1c92fe5492ce57e47c28c1e339c3c87779d2f188ac"}
//      {"txid":"270108f3a25e1c892d97bddfed6cb1fab11224aa34e7f1ed6ef3e72f0ca89cbc", "vout":0, "satoshis": 78125000, "address":faucetAddress, "scriptPubKey":"76a9140c1c92fe5492ce57e47c28c1e339c3c87779d2f188ac"},
      {"txid":"c95701b7a93baa36863840f665e5adb39a0cd4d8d1996c4f6438861bab7f8562", "vout":0, "satoshis": 78125000, "address":faucetAddress, "scriptPubKey":"76a9140c1c92fe5492ce57e47c28c1e339c3c87779d2f188ac"}
      
//      {"txid":"d92e4d5f339a3f5a8cb710caa01f2459aac78221f2102907f801fed8fd5d48b7", "vout":0, "satoshis": 78125000, "address":faucetAddress, "scriptPubKey":"76a9140c1c92fe5492ce57e47c28c1e339c3c87779d2f188ac"}
      
      ]];
    return utxoList;
  }

  //bitcoin-cli listunspent 6 9999999 "[\"1PGFqEzfmQch1gKD3ra4k18PNj3tTUUSqg\",\"1LtvqCaApEdUGFkpKMM4MstjcaL4dKg8SP\"]"
  const rpc = await noderpc(rpcCommand("listunspent", [1, 999999999, [faucetAddress]]));
  let jrpc = JSON.parse(rpc)
  //console.log(jrpc);
  return [jrpc["result"]]
}

//TODO: get utxo of an arbitrary address
function utxos(address) {
  //TODO: should get fresh list every time spend is called
  //TODO: query bitcoind for utxo for address
  let utxoList = [];
  return utxoList
}

// Returns the utxo with the biggest balance from an array of utxos.
function findBiggestUtxo(utxos) {
  let largestAmount = 0
  let largestIndex = 0
  for (var i = 0; i < utxos.length; i++) {
    const thisUtxo = utxos[i]
    const amt = getAmount(thisUtxo);
    if (amt > largestAmount) {
      largestAmount = amt
      largestIndex = i
    }
  }
  return utxos[largestIndex]
}

function toSatoshis(amount) {
  return amount * 100000000;
}

//get amount from utxo. insight has diferent structure than bitcoind listunspent
function getAmount(thisUtxo) {
  return thisUtxo.satoshis ? thisUtxo.satoshis : toSatoshis(thisUtxo.amount) ;
}

// Returns true if address is valid, false otherwise.
function validateAddress(address) {
    if (!bsv.Address.isValid(address, bsv.Networks.testnet)) {return false}
    return true
}

