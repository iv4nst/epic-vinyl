require('dotenv').config();

const express = require('express');
const engine = require('ejs-mate');
const path = require('path');
const favicon = require('serve-favicon')
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const User = require('./models/user')
const session = require('express-session');
const mongoose = require('mongoose');
const methodOverride = require('method-override');
const createError = require('http-errors');

// require routes
const indexRoutes = require('./routes/index');
const vinylRoutes = require('./routes/vinyls');
const reviewsRoutes = require('./routes/reviews');

const app = express();

mongoose.connect(process.env.DATABASEURL || 'mongodb://localhost:27017/epic-vinyl', {
	useNewUrlParser    : true,
	useCreateIndex     : true,
	useUnifiedTopology : true
});
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
	console.log('Connected to DB!');
});

// use ejs-locals for all ejs templates:
app.engine('ejs', engine);
// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
// set public assets directory
app.use(express.static('public'));

app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method'));

// add moment to every view
app.locals.moment = require('moment');

// configure passport and sessions
app.use(
	session({
		secret            : 'Secret message.',
		resave            : false,
		saveUninitialized : true
	})
);
app.use(passport.initialize());
app.use(passport.session());

passport.use(User.createStrategy())
passport.serializeUser(User.serializeUser())
passport.deserializeUser(User.deserializeUser())

// set local variables middleware
app.use(function(req,res,next){
    // set default user (to use until development is done)
	// req.user = {
	// 	// _id      : '5f2937badab11320a4e870dd',
	// 	// username : 'ivan'
	// 	// _id      : '5f2940f8a640d42834f47575',
	// 	// username : 'ivan2'
	// 	_id      : '5f29641ed01fb72a18fcd099',
	// 	username : 'ivan3'
	// };
	res.locals.currentUser = req.user;

	// set default page title
	res.locals.title = 'Epic-Vinyl';

	// set success flash message
	res.locals.success = req.session.success || '';
	delete req.session.success;

	// set error flash message
	res.locals.error = req.session.error || '';
	delete req.session.error;

	// continue on to next function in middleware chain
	next();
})

// mount routes
app.use('/', indexRoutes);
app.use('/vinyls', vinylRoutes);
app.use('/vinyls/:id/reviews', reviewsRoutes);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
	const err = new Error('Not found');
	err.status = 404;
	next(err);
	// next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
	// set locals, only providing error in development
	res.locals.message = err.message;
	res.locals.error = req.app.get('env') === 'development' ? err : {};

	// render the error page
	res.status(err.status || 500);
	res.render('error');
});

module.exports = app;
