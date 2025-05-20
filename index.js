const express = require("express");
const dotenv = require("dotenv");
const socketIo = require("socket.io");
const mongoose = require("mongoose");
const http = require("http");

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*" },
});

// Attach io to app
io.on("connection", (socket) => {
  console.log("New client connected: " + socket.id);

  socket.on("join-restaurant", (restaurantId) => {
    socket.join(restaurantId);
    console.log(`Socket ${socket.id} joined restaurant ${restaurantId}`);
  });
});
app.set("io", io);

app.use(express.json());

// routes using
const userRouter = require("./routes/userRoutes");
const productRouter = require("./routes/productRoutesRoutes");
const resturantRouter = require("./routes/restaurantRoutes");
const locationRouter = require("./routes/locationRoutes");
const agentRouter = require("./routes/agentRoutes");
const offerRouter = require("./routes/offerRoutes");
const orderRouter = require("./routes/orderRoutes");
const couponRoutes = require("./routes/couponRoutes");
const feedbackRoutes = require("./routes/feedbackRoutes");

app.use("/user", userRouter);
app.use("/restaurants", productRouter);
app.use("/restaurants", resturantRouter);
app.use("/restaurants", offerRouter);

app.use("/order", orderRouter);
app.use("/coupon", couponRoutes);
app.use("/location", locationRouter);
app.use("/agent", agentRouter);
app.use("/feedback", feedbackRoutes);

app.get("/", (req, res) => {
  res.send("API is running 🚀");
});

// ✅ Connect to DB and start server only after DB is connected
const PORT = process.env.PORT || 5000;
mongoose
  .connect(process.env.MONGO_URI, {
  
    serverSelectionTimeoutMS: 15000, // increased timeout
  })
  .then(() => {
    console.log("✅ MongoDB connected");
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err);
  });
