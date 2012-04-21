
var fs = require('fs')
  , path = require('path')
  , pt = require('../')
  , a = require('assertions')

exports.simple = function (test) {

  fs.createReadStream(path.join(__dirname, 'fixtures', 'lsof'))
  .pipe(
    pt(function (err, table) {
      if(err) throw err
      a.every(table, a._hasKeys(['COMMAND', 'PID','USER', 'FD', 'TYPE', 'DEVICE', 'SIZE/OFF', 'NODE','NAME'], a._isString))
      test.done()
    })
  )
}