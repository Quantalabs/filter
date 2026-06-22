import express from "express"

const app = express();
const port = 8080;

app.use(express.static('public'))

app.listen(port, () => {
  console.log(`Server @ http://localhost:${port}/`)
})
