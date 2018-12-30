"use strict"

const wallet = require("../../utils/wallet.js")

// Inspect utility used for debugging.
const util = require("util")
util.inspect.defaultOptions = {
  showHidden: true,
  colors: true,
  depth: 1
}

// get utxos for an address
async function getUtxos(ctx, next) {
  try {
    const address = ctx.params.address
    console.log(address)
    // const result = await wallet.broadcast(hex)
    // console.log(result)
    // if (result.length == 64) {
    //   //success?
    //   ctx.body = { result }
    // } else {
    //   console.log(`Error broadcasting: ${result}`)
    //   ctx.throw(500)
    // }

  } catch (err) {
    console.log(`Error in broadcast: `, err)

    if (err === 404 || err.name === "CastError") ctx.throw(404)

    ctx.throw(500)
  }

  if (next) return next()
}

module.exports = {
  getUtxos
}

