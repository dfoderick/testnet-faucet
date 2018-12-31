"use strict"

const wallet = require("../../utils/wallet.js")

// Inspect utility used for debugging.
const util = require("util")
util.inspect.defaultOptions = {
  showHidden: true,
  colors: true,
  depth: 1
}

// broadcast a raw transaction
async function getBroadcast(ctx, next) {
  try {
    const hex = ctx.params.hex
    console.log(hex)
    const result = await wallet.broadcast(hex)
    console.log(result)
    if (result.length == 64) {
      //success?
      ctx.body = { result }
    } else {
      console.log(`Error broadcasting: ${result}`)
      ctx.throw(500)
    }

  } catch (err) {
    console.log(`Error in broadcast: `, err)

    if (err === 404 || err.name === "CastError") ctx.throw(404)

    ctx.throw(500)
  }

  if (next) return next()
}

async function decode(ctx, next) {
  try {
    const hex = ctx.params.hex
    console.log(hex)
    const result = await wallet.decode(hex)
    console.log(result)
    ctx.body = { result }

  } catch (err) {
    console.log(`Error in decode: `, err)

    if (err === 404 || err.name === "CastError") ctx.throw(404)

    ctx.throw(500)
  }

  if (next) return next()
}

module.exports = {
  getBroadcast,
  decode
}

