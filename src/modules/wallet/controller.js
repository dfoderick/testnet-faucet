"use strict"

const wallet = require("../../utils/wallet.js")

// Inspect utility used for debugging.
const util = require("util")
util.inspect.defaultOptions = {
  showHidden: true,
  colors: true,
  depth: 1
}

// generate a new wallet mnemonic and receiving address
async function newWallet(ctx, next) {
  try {
    const result = await wallet.generateWallet()
    console.log(result)
    ctx.body = result

  } catch (err) {
    console.log(`Error generating a new wallet: `, err)

    if (err === 404 || err.name === "CastError") ctx.throw(404)

    ctx.throw(500)
  }

  if (next) return next()
}

module.exports = {
  newWallet
}

