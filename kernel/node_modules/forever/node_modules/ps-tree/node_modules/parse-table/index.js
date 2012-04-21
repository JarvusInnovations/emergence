var es = require('event-stream')
  
//creates a writable stream that parses a table... usually the output of a unix command!


module.exports = tableStream

function tableStream(callback) {
  var headers
  return es.connect(
    es.split(),
    es.map(function (line, cb) { //this could parse alot of unix command output
      var columns = line.trim().split(/\s+/)
      if(!headers)
        headers = columns
      else if (line){
        var row = {}
        //for each header, 
        var h = headers.slice()
        while (h.length) {
          row[h.shift()] = h.length ? columns.shift() : columns.join(' ')
        }
        return cb(null, row)
      }
      return cb()
    }),
    es.writeArray(callback)
  ).on('error', callback)
}
