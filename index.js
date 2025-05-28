const express = require("express");
const dotenv = require("dotenv");
const socketIo = require("socket.io");
const mongoose = require("mongoose");
const http = require("http");
const cors = require('cors');
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*" },
});
app.use(cors());
app.use(cors({
  origin: 'http://localhost:5173',  // your frontend URL
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // allowed HTTP methods
  credentials: true,  // if you need cookies or authorization headers
}));



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










const dummyCategories = [
  {
    categoryName: "Fruits",
    categoryId: 1,
    categoryimagerelation: {
      imageName: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTjhcvIlF6I8UzQly7Qzkh2vAHtSGwbgq_XPg&s"
    },
    categoryrelation1: [
      {
        subCategoryId: 101,
        subcategoryName: "Apples",
        subcategoryImagerelation: {
          imageName: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSW-oteAACfNN68JU4E2egKJeaMrL8kdUQuuA&s"
        }
      },
      {
        subCategoryId: 102,
        subcategoryName: "Bananas",
        subcategoryImagerelation: {
          imageName: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT-E3j6WhT2uOrCGqZABI_m8E4fCXNMYdXhmA&s"
        }
      }
    ]
  },
  {
    categoryName: "Vegetables",
    categoryId: 2,
    categoryimagerelation: {
      imageName: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSNULJ6YE0WsLqqBUs3ozHh6rkZDFAJlXzlFw&s"
    },
    categoryrelation1: [
      {
        subCategoryId: 201,
        subcategoryName: "Tomatoes",
        subcategoryImagerelation: {
          imageName: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSsTnN1VYHPxQDMCDKBZWs2mKGXT2bO9arKYfO3g9LjMvjLiuCoVNuCeEA&s"
        }
      },
      {
        subCategoryId: 202,
        subcategoryName: "Spinach",
        subcategoryImagerelation: {
          imageName: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSsTnN1VYHPxQDMCDKBZWs2mKGXT2bO9arKYfO3g9LjMvjLiuCoVNuCeEA&s"
        }
      }
    ]
  }
];

















app.get("/", (req, res) => {
  res.send("API is running 🚀");
});
app.get("/test/categories", (req, res) => {
  res.status(200).json(dummyCategories);
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
