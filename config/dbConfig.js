const mongoose = require('mongoose')
require("dotenv").config()
const db = async() =>
{ 
    try {
        await mongoose.connect(process.env.MONGO_URI,
            {
                  serverSelectionTimeoutMS: 15000, // increase timeout
            }
        )

        console.log("db connected")
    } catch (error) {
        
        console.log(error)
    }

}
module.exports = db