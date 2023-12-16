const express = require('express')
const app = express()
const port = 3000

var options = {
  setHeaders: function(res, path, stat) {
    res.set("Cross-Origin-Opener-Policy", "same-origin")
    res.set("Cross-Origin-Embedder-Policy", "require-corp")
  }
}
app.use(express.static("dist", options))

app.listen(port, () => {
  console.log(`Listening on port ${port}`)
})