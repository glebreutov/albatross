/* eslint-env node */
const EventEmitter = require('events')
const bittrex = require('node-bittrex-api')
const {bind, createConverter} = require('./tools')
const _ = require('lodash')
const {pairs} = require('./const')
const debug = require('debug')('BittrexApi')

const pairDict = Object.keys(pairs).map(pairKey => {
  const pair = pairs[pairKey]
  return {
    normal: pair,
    specific: `${pair.base}-${pair.counter}`
  }
})

const converter = createConverter(pairDict)

// https://github.com/dparlevliet/node.bittrex.api#websockets
class BittrexApi extends EventEmitter {
  constructor (...args) {
    super(...args)
    debug('Creating BittrexApi')
    //bittrex.options({verbose: true})
    bind([
      'onSubscriptionMessage'
    ], this)
    this.isDestroying = false
    this.subscriptions = []
  }

  getLastUpdated () {
    return this.subscriptions.map(s => ({pair: converter.normalize(s.pair), lastUpdated: s.lastUpdated}))
  }

  onSubscriptionMessage (data) {
    if (this.isDestroying) {
      return
    }
    if (data.M === 'updateExchangeState') {
      data.A.forEach(dataFor => {
        const pair = dataFor.MarketName
        const subscription = _.find(this.subscriptions, {channel: 'book', pair})
        if (!subscription) {
          debug(`ERROR: received data for pair ${pair} but no according subscription found`)
          return
        }
        subscription.lastUpdated = +new Date()
        this.emit('bookUpdate', converter.normalize(pair), {buy: dataFor.Buys, sell: dataFor.Sells})
      })
    }
  }

  // todo: reconnects?
  async subscribe (pairs) {
    if (this.isDestroying) {
      return
    }
    for (let i = 0; i < pairs.length; i++) {
      const pair = converter.denormalize(pairs[i])
      const newSub = {
        channel: 'book',
        pair
      }
      if (_.some(this.subscriptions, newSub)) {
        debug(`already subscribed to ${pair}`)
        continue
      }
      this.subscriptions.push(newSub)
    }
    bittrex.websockets.subscribe(pairs.map(converter.denormalize), this.onSubscriptionMessage)
  }

  destroy () {
    debug('destroying')
    this.isDestroying = true
  }
}

module.exports = BittrexApi
