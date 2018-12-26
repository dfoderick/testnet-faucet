/*
  This library handles all the wallet functionality.
*/

"use strict"

module.exports = {
  consolidateUTXOs, // Consolidate up to 20 spendable UTXOs
  sendBCH, // Send BCH to an address.
  getBalance
}

// Inspect utility used for debugging.
const util = require("util")
util.inspect.defaultOptions = {
  showHidden: true,
  colors: true,
  depth: 1
}

const BB = require("bitbox-sdk/lib/bitbox-sdk").default
const BITBOX = new BB({ restURL: `https://trest.bitcoin.com/v1/` })
// const BITBOX = new BB({ restURL: `http://localhost:3000/v1/` })
// const BITBOX = new BB({ restURL: `http://decatur.hopto.org:3003/v1/` })
//const BITBOX = new BB({ restURL: `http://192.168.0.13:3003/v1/` })


var fs = require('fs');
console.log(process.cwd());
const walletInfo = require(`../../wallet.json`)

async function consolidateUTXOs() {
  try {
    const mnemonic = walletInfo.mnemonic

    // root seed buffer
    const rootSeed = BITBOX.Mnemonic.toSeed(mnemonic)

    // master HDNode
    const masterHDNode = BITBOX.HDNode.fromSeed(rootSeed, "testnet") // Testnet

    // HDNode of BIP44 account
    const account = BITBOX.HDNode.derivePath(masterHDNode, "m/44'/145'/0'")

    const change = BITBOX.HDNode.derivePath(account, "0/0")

    // get the cash address
    const cashAddress = BITBOX.HDNode.toCashAddress(change)
    // const cashAddress = walletInfo.cashAddress

    // instance of transaction builder
    const transactionBuilder = new BITBOX.TransactionBuilder("testnet")

    // Combine all the utxos into the inputs of the TX.
    const u = await BITBOX.Address.utxo([cashAddress])
    const inputs = []
    let originalAmount = 0

    console.log(`Number of UTXOs: ${u[0].length}`)

    for (let i = 0; i < u[0].length; i++) {
      const thisUtxo = u[0][i]

      // Most UTXOs will come from mining rewards, so we need to wait 100
      // confirmations before we spend them.
      if (thisUtxo.confirmations > 100) {
        originalAmount = originalAmount + thisUtxo.satoshis
        inputs.push(thisUtxo)
        transactionBuilder.addInput(thisUtxo.txid, thisUtxo.vout)
      }

      // Can only do 20 UTXOs at a time.
      if (inputs.length > 19) break
    }

    // original amount of satoshis in vin
    // console.log(`originalAmount: ${originalAmount}`)

    // get byte count to calculate fee. paying 1 sat/byte
    const byteCount = BITBOX.BitcoinCash.getByteCount(
      { P2PKH: inputs.length },
      { P2PKH: 1 }
    )
    // console.log(`fee: ${byteCount}`)

    // amount to send to receiver. It's the original amount - 1 sat/byte for tx size
    const sendAmount = originalAmount - byteCount
    console.log(`sendAmount: ${sendAmount}`)

    // Catch a bug here
    if (sendAmount < 0) {
      console.log(`sendAmount is negative, aborting UTXO consolidation.`)
      return
    }

    // add output w/ address and amount to send
    transactionBuilder.addOutput(cashAddress, sendAmount)

    // keypair
    const keyPair = BITBOX.HDNode.toKeyPair(change)

    // sign w/ HDNode
    let redeemScript
    inputs.forEach((input, index) => {
      // console.log(`inputs[${index}]: ${util.inspect(inputs[index])}`)
      transactionBuilder.sign(
        index,
        keyPair,
        redeemScript,
        transactionBuilder.hashTypes.SIGHASH_ALL,
        inputs[index].satoshis
      )
    })

    // build tx
    const tx = transactionBuilder.build()

    // output rawhex
    const hex = tx.toHex()
    // console.log(`TX Hex: ${hex}`)

    // sendRawTransaction to running BCH node
    const broadcast = await BITBOX.RawTransactions.sendRawTransaction(hex)
    console.log(`\nConsolidating UTXOs. Transaction ID: ${broadcast}`)
  } catch (err) {
    console.log(`Error in consolidateUTXOs: `, err)
  }
}

// Send BCH to an address
async function sendBCH(bchAddr) {
  try {
    // Exit if not a valid cash address.
    const isValid = validateAddress(bchAddr)
    if (!isValid) return false

    // Amount to send in satoshis
    const AMOUNT_TO_SEND = 10000000

    const mnemonic = walletInfo.mnemonic

    // root seed buffer
    const rootSeed = BITBOX.Mnemonic.toSeed(mnemonic)

    // master HDNode
    const masterHDNode = BITBOX.HDNode.fromSeed(rootSeed, "testnet") // Testnet

    // HDNode of BIP44 account
    const account = BITBOX.HDNode.derivePath(masterHDNode, "m/44'/145'/0'")

    const change = BITBOX.HDNode.derivePath(account, "0/0")

    const cashAddress = walletInfo.cashAddress

    // Get the biggest UTXO, which is assumed to be spendable.
    const u = await BITBOX.Address.utxo([cashAddress])
    const utxo = findBiggestUtxo(u[0])

    // instance of transaction builder
    const transactionBuilder = new BITBOX.TransactionBuilder("testnet")

    const satoshisToSend = AMOUNT_TO_SEND
    const originalAmount = utxo.satoshis

    const vout = utxo.vout
    const txid = utxo.txid

    // add input with txid and index of vout
    transactionBuilder.addInput(txid, vout)

    // get byte count to calculate fee. paying 1 sat/byte
    const byteCount = BITBOX.BitcoinCash.getByteCount(
      { P2PKH: 1 },
      { P2PKH: 2 }
    )

    // Calculate the TX fee.
    const satoshisPerByte = 1
    const txFee = Math.floor(satoshisPerByte * byteCount)

    // amount to send back to the sending address. It's the original amount - 1 sat/byte for tx size
    const remainder = originalAmount - satoshisToSend - txFee

    // add output w/ address and amount to send
    transactionBuilder.addOutput(cashAddress, remainder)
    transactionBuilder.addOutput(
      BITBOX.Address.toLegacyAddress(bchAddr),
      satoshisToSend
    )

    // Generate a keypair from the change address.
    const keyPair = BITBOX.HDNode.toKeyPair(change)

    // Sign the transaction with the HD node.
    let redeemScript
    transactionBuilder.sign(
      0,
      keyPair,
      redeemScript,
      transactionBuilder.hashTypes.SIGHASH_ALL,
      originalAmount
    )

    // build tx
    const tx = transactionBuilder.build()
    // output rawhex
    const hex = tx.toHex()

    // sendRawTransaction to running BCH node
    const broadcast = await BITBOX.RawTransactions.sendRawTransaction(hex)
    console.log(`Sending BCH. Transaction ID: ${broadcast}`)

    return broadcast
  } catch (err) {
    console.log(`Error in wallet.sendBCH().`)
    throw err
  }
}

// Returns the utxo with the biggest balance from an array of utxos.
function findBiggestUtxo(utxos) {
  let largestAmount = 0
  let largestIndex = 0

  for (var i = 0; i < utxos.length; i++) {
    const thisUtxo = utxos[i]

    if (thisUtxo.satoshis > largestAmount) {
      largestAmount = thisUtxo.satoshis
      largestIndex = i
    }
  }

  return utxos[largestIndex]
}

// Returns true if BCH address is valid, false otherwise.
function validateAddress(bchAddr) {
  try {
    BITBOX.Address.isCashAddress(bchAddr)
    BITBOX.Address.isTestnetAddress(bchAddr)
    return true
  } catch (err) {
    return false
  }
}

async function getBalance() {
  const mnemonic = walletInfo.mnemonic

  // root seed buffer
  const rootSeed = BITBOX.Mnemonic.toSeed(mnemonic)

  // master HDNode
  const masterHDNode = BITBOX.HDNode.fromSeed(rootSeed, "testnet") // Testnet

  // HDNode of BIP44 account
  const account = BITBOX.HDNode.derivePath(masterHDNode, "m/44'/145'/0'")

  const change = BITBOX.HDNode.derivePath(account, "0/0")

  // get the cash address
  const cashAddress = BITBOX.HDNode.toCashAddress(change)

  // first get BCH balance
  const balanceObj = await BITBOX.Address.details([cashAddress])
  const balance = balanceObj[0].balance
  //console.log(`balance: ${JSON.stringify(balance, null, 2)}`)

  //console.log(`BCH Balance information for ${cashAddress}:`)
  console.log(`balance: ${balance} BCH`)
  return balance
}
