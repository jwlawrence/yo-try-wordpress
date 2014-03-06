// Paths - TODO: make paths dynamic
var theme = './app/wp-content/themes/<%= themeName %>/',
	scripts = theme + 'scripts/',
	styles = theme + 'styles/',
	images = theme + 'images/',
	dist = theme + 'dist/';

// Load plugins
var gulp = require('gulp'),
	browserify = require('gulp-browserify'),
	less = require('gulp-less'),
	autoprefixer = require('gulp-autoprefixer'),
	minifycss = require('gulp-minify-css'),
	jshint = require('gulp-jshint'),
	uglify = require('gulp-uglify'),
	imagemin = require('gulp-imagemin'),
	rename = require('gulp-rename'),
	clean = require('gulp-clean'),
	concat = require('gulp-concat'),
	notify = require('gulp-notify'),
	cache = require('gulp-cache'),
	livereload = require('gulp-livereload'),
	lr = require('tiny-lr'),
	server = lr();

// Styles
gulp.task('styles', function() {
	return gulp.src(styles + 'main.less')
		.pipe(less())
		.pipe(autoprefixer('last 2 version', 'safari 5', 'ie 8', 'ie 9', 'opera 12.1', 'ios 6', 'android 4'))
		.pipe(gulp.dest(dist + 'styles'))
		.pipe(minifycss())
		.pipe(rename({ suffix: '.min' }))
		.pipe(livereload(server))
		.pipe(gulp.dest(dist + 'styles'))
		.pipe(notify({ message: 'Styles task complete' }));
});

// Scripts
gulp.task('scripts', function() {
	// Single entry point to browserify
	return gulp.src(scripts + 'main.js')
		.pipe(browserify({
			shim: {},
			insertGlobals: true,
			debug : true
		}))
		.pipe(gulp.dest(dist + 'scripts'))
		.pipe(uglify())
		.pipe(rename({ suffix: '.min' }))
		.pipe(livereload(server))
		.pipe(gulp.dest(dist + 'scripts'))
		.pipe(notify({ message: 'Scripts task complete' }));
});

// Images
gulp.task('images', function() {
	return gulp.src(images + '**/*')
		.pipe(cache(imagemin({ optimizationLevel: 3, progressive: true, interlaced: true })))
		.pipe(livereload(server))
		.pipe(gulp.dest(dist + 'images'))
		.pipe(notify({ message: 'Images task complete' }));
});

// Clean
gulp.task('clean', function() {
	return gulp.src([dist + '**/*'], { read: false })
		.pipe(clean());
});

// Watch
gulp.task('watch', function() {

	// Listen on port 35729
	server.listen(35729, function(err) {
		if (err) {
			return console.log(err)
		};

		// Watch .scss files
		gulp.watch(styles + '**/*.less', ['styles']);

		// Watch .js files
		gulp.watch(scripts + '**/*.js', ['scripts']);
	});

});

// Default task
gulp.task('default', ['clean'], function() {
	gulp.start('styles', 'scripts', 'images');
});