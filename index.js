require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const md5 = require("md5");
const http = require('http');
const socketIO = require('socket.io');
const passport = require('passport');
const passportLocalMongoose = require('passport-local-mongoose')
const findOrCreate = require('mongoose-findorcreate');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// =============ALL REQUIRED PACKAGES AND MODULES=================//

app.use(express.static("public"));

app.set('view engine','ejs');

app.use(bodyParser.urlencoded({
    extended:true
}));

mongoose.connect("mongodb://localhost:27017/yashgram").then(() => console.log("connecected successfully"))
.catch((err) => {
    console.log('not connected sorry')
})

const userSchema = new mongoose.Schema({
    email: String,
    password: String,
    phone:Number,
    nameU:String,
    dob:String,
    googleId:String,
    nameGoogle:String,
    secretKey: String,
    otp: String,
 
});


userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = new mongoose.model("User",userSchema);

//============SUCCESSFULLY CONNECTED TO THE MONGOOSE SERVER===============//

const session = require('express-session');
const MongoStore = require('connect-mongo');

const store = MongoStore.create({
  mongoUrl: 'mongodb://localhost:27017/yashgram',
  mongooseConnection: mongoose.connection,
  collection: 'sessions' 
});

app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  store: store
}));


passport.use(User.createStrategy());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

passport.use(new GoogleStrategy({
  clientID:process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: "http://localhost:3000/auth/google/chat-app",
  userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
},


function(accessToken, refreshToken, profile, cb) {
  console.log(profile.displayName);
  User.findOrCreate({ googleId: profile.id }, function (err, user) {
    return cb(err, user);

  });
}
));

//===========SUCCESSFULLY MADE AUTHENTIATION FOR LOGIN WITH GOOGLE============//

app.get("/chat",function(req,res) {

  res.render("chat");
});

app.get("/",function(req,res) {

    res.render("index");
});

app.get("/auth/google",
  passport.authenticate("google", { scope: ["profile"] })
);

app.get("/auth/google/chat-app",
  passport.authenticate("google", { failureRedirect: "/" }),
  function(req, res) {
    res.render("room");
  }
);

app.get("/register", function(req,res) {
    res.render("register" );

});

//=================BASIC GET REQUEST IS DONE =================//

app.post("/chat", async function(req, res) {

    const newUser = new User({
        email: req.body.username,
        password: md5( req.body.password),
        phone:req.body.phone,
        nameU: req.body.fullName,
        dob:req.body.dob,     
    });

    try {
      const username = req.body.username;
      const foundUser = await User.findOne({ email: username});
      if (foundUser) {
        res.send("user already exists")
      }
      else {
        const pass = req.body.password;
        const cnfpass = req.body.cnfpass; 

        if (pass === cnfpass) {
          await newUser.save();
          res.render("chat");
        }
        else {
          res.send("passowrd is not same"); 
        } 
      }
    } catch (err) {
        console.log(err);
        res.render("error");
    }
});
  //=====================POSTT REQUEST FOR REGISTER DONE SUCCESSFULLY==============//

app.get("/index", function(req,res) {
    res.render("index");

});

app.post("/login", async function(req, res) {
  try {
      const username = req.body.username;
      const password = md5(req.body.password);

      const foundUser = await User.findOne({ email: username });

      if (foundUser && foundUser.password === password) {
          res.render("room");
      } else {
          res.render("index", { errorMessage: "Incorrect username or password" });
      }
  } catch (err) {
      console.error(err);
      res.status(500).send("Internal Server Error");
  }
});

//=====================POSTT REQUEST FOR LOGIN DONE SUCCESSFULLY==============//

app.post('/chat', (req, res) => {
  res.render("chat")

});


//=====================CODE FOR CHAT APP => LIKE, SEND IMG, ONLINE COUNT,ETC.==============//

let count;
let onlineUsers = 0;
const likesCounts = {};
io.on('connection', (socket) => {
  console.log('A user connected');
  onlineUsers++;

  socket.on('chat message', function (msg) {
    const timestamp = new Date().getTime(); // Add a unique identifier to each message USING DATE LOGIC
    io.emit('chat message', { id: timestamp, message: `<span style="color:#ff9d3b">${socket.username}:</span> ${msg}` });
});

  socket.on('image', (image) => {
    io.emit('image', { username: socket.username, image: image });
  });

 
  io.emit('update online users', onlineUsers);
  console.log(`A user connected. Online users: ${onlineUsers}`);

  socket.on('set username', (username) => {
    socket.username = username;
    io.emit('user joined', username);
});

function processLike(messageId) {
  likesCounts[messageId] = likesCounts[messageId] || 0;
  likesCounts[messageId]++;
  return likesCounts[messageId];
}


socket.on('like message', function (likedMessageId) {
  const likesCount = processLike(likedMessageId);
  io.emit('update likes', { likedMessageId, likesCount });
});


  socket.on('disconnect', () => {
    if (socket.username) {
      io.emit('chat message', `${socket.username} has left the chat`);
      onlineUsers--;
      io.emit('update online users', onlineUsers);
      io.emit('chat message', `Online users: ${onlineUsers}`);
    }
    console.log('User disconnected');
  });
});

server.listen(3000, () => {
  console.log('Server listening on port 3000');
});
