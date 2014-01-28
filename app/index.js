'use strict';

var util = require('util'),
	path = require('path'),
	fs = require('fs'),
	yeoman = require('yeoman-generator'),
	rimraf = require('rimraf'),
	exec = require('child_process').exec,
	semver = require('semver'),
	config = require('./../config.js')

	module.exports = Generator

	function Generator(args, options) {
		yeoman.generators.Base.apply(this, arguments)

		this.sourceRoot(path.join(__dirname, 'templates'))

		this.on('end', function() {
			this.installDependencies({
				skipInstall: options['skip-install']
			})
		})
	}

util.inherits(Generator, yeoman.generators.NamedBase)

// try to find the config file and read the infos to set the prompts default values
Generator.prototype.getConfig = function getConfig() {
	var cb = this.async(),
		self = this

		self.configExists = false

		config.getConfig(function(err, data) {
			if (!err) {
				self.configExists = true
			}

			self.defaultAuthorName = data.authorName
			self.defaultAuthorURI = data.authorURI
			self.defaultTheme = data.themeUrl
			self.latestVersion = data.latestVersion

			cb()
		})
}

// get the latest stable version of Wordpress
Generator.prototype.getVersion = function getVersion() {
	var cb = this.async(),
		self = this

		this.log.writeln('')
		this.log.writeln('Trying to get the latest stable version of Wordpress')

		// try to get the latest version using the git tags
		try {
			var version = exec('git ls-remote --tags git://github.com/WordPress/WordPress.git', function(err, stdout, stderr) {
				if (err !== null) {
					self.writeln('exec error: ' + err)
				} else {
					var pattern = /\d\.\d[\.\d]*/ig,
						match = stdout.match(pattern),
						patternShort = /^\d\.\d$/,
						latestVersion = match[match.length - 1],
						semverLatestString = latestVersion,
						semverVersionString = self.latestVersion

					if (semverLatestString.match(patternShort)) semverLatestString += '.0'
					if (semverVersionString.match(patternShort)) semverVersionString += '.0'

					if (semverLatestString !== null && typeof semverLatestString !== 'undefined') {
						// update config if needed
						if (semver.gt(semverLatestString, semverVersionString)) {
							self.log.writeln('Updating config with latest version: ' + latestVersion)
							config.updateWordpressVersion(latestVersion)
						}

						self.latestVersion = latestVersion
						self.log.writeln('Latest version: ' + self.latestVersion)
					}
				}
				cb()
			})
		} catch (e) {
			cb()
		}
}

Generator.prototype.askFor = function askFor() {
	var cb = this.async(),
		self = this

	// Validate required
	var requiredValidate = function(value) {
		if (value == '') {
			return 'This field is required.';
		}
		return true;
	};

	var prompts = [
		{
			name: 'url',
			message: 'WordPress URL',
			validate: requiredValidate,
			filter: function(value) {
				value = value.replace(/\/+$/g, '');
				if (!/^http[s]?:\/\//.test(value)) {
					value = 'http://' + value;
				}
				return value;
			}
		},
		{
			name: 'dbName',
			message: 'Database name',
			validate: requiredValidate
		},
		{
			name: 'dbUser',
			message: 'Database user',
			default: 'root'
		},
		{
			name: 'dbPassword',
			message: 'Database password',
			default: 'root'
		},
		{
			name: 'tablePrefix',
			message: 'Database table prefix',
			default: 'try_wp_'
		},
		{
			name: 'wordpressVersion',
			message: 'Which version of Wordpress do you want?',
			default: self.latestVersion
		},
		{
			name: 'themeBoilerplate',
			message: 'Starter theme (please provide a github link)',
			default: self.defaultTheme,
			filter: function(input) {
				return input.replace(/\ /g, '').toLowerCase()
			}
		},
		{
			name: 'themeName',
			message: 'What should the theme directory be named?',
			default: 'try-theme'
		},
		{
			name: 'authorName',
			message: 'Author name',
			default: self.defaultAuthorName
		},
		{
			name: 'authorURI',
			message: 'Author URI',
			default: self.defaultAuthorURI
		},
		{
			name: 'includeRequireJS',
			type: 'confirm',
			message: 'Would you like to include RequireJS (for AMD support)?'
		}
	]

	this.prompt(prompts, function(props) {

		// set the property to parse the gruntfile
		self.url = props.url
		self.dbName = props.dbName
		self.dbUser = props.dbUser
		self.dbPassword = props.dbPassword
		self.tablePrefix = props.tablePrefix
		self.wordpressVersion = props.wordpressVersion
		self.themeOriginalURL = props.themeBoilerplate
		self.themeBoilerplate = props.themeBoilerplate
		self.themeNameOriginal = props.themeName
		self.themeName = props.themeName
		self.authorName = props.authorName
		self.authorURI = props.authorURI
		self.includeRequireJS = props.includeRequireJS

		// check if the user only gave the repo url or the entire url with /archive/{branch}.tar.gz
		var tarballLink = (/[.]*archive\/[.]*.*.tar.gz/).test(self.themeBoilerplate)
		if (!tarballLink) {
			// if the user gave the repo url we add the end of the url. we assume he wants the master branch
			var lastChar = self.themeBoilerplate.substring(self.themeBoilerplate.length - 1)
			if (lastChar === '/') {
				self.themeBoilerplate = self.themeBoilerplate + 'archive/master.tar.gz'
			} else {
				self.themeBoilerplate = self.themeBoilerplate + '/archive/master.tar.gz'
			}
		}

		// create the config file it does not exist
		if (!self.configExists) {
			var values = {
				authorName: self.authorName,
				authorURI: self.authorURI,
				themeUrl: self.themeOriginalURL
			}
			config.createConfig(values, cb)
		} else {
			cb()
		}
	})
}

// download the framework and unzip it in the project app/
Generator.prototype.createApp = function createApp() {
	var cb = this.async(),
		self = this

		this.log.writeln('Let\'s download the framework, shall we?')
		this.log.writeln('Downloading Wordpress version ' + self.wordpressVersion + ' please wait...')
		this.tarball('https://github.com/WordPress/WordPress/archive/' + self.wordpressVersion + '.tar.gz', 'app', cb)
}

// remove the basic theme and create a new one
Generator.prototype.createTheme = function createTheme() {
	var cb = this.async(),
		self = this

		this.log.writeln('First let\'s remove the built-in themes we will not use')

		fs.readdir('app/wp-content/themes', function(err, files) {
			// remove the existing themes
			if (typeof files != 'undefined' && files.length !== 0) {
				files.forEach(function(file) {
					var pathFile = fs.realpathSync('app/wp-content/themes/' + file),
						isDirectory = fs.statSync(pathFile).isDirectory()

						if (isDirectory) {
							rimraf.sync(pathFile)
							self.log.writeln('Removing ' + pathFile)
						}
				})
			}

			self.log.writeln('')
			self.log.writeln('Now we download the theme')

			// create the theme
			self.tarball(self.themeBoilerplate, 'app/wp-content/themes/' + self.themeName, cb)
		})
}

// add Require.js if needed
Generator.prototype.requireJS = function requireJS() {
	var cb = this.async(),
		self = this

	if (self.includeRequireJS) {
		this.remote('jrburke', 'requirejs', '2.0.5', function(err, remote) {
			if (err) {
				return cb(err)
			}

			fs.mkdir('app/wp-content/themes/' + self.themeName + '/scripts/vendor', function() {
				remote.copy('require.js', 'app/wp-content/themes/' + self.themeName + '/scripts/vendors/require.js')
				cb()
			})
		})
	} else {
		cb()
	}
}

// generate the files to use Yeoman and the git related files
Generator.prototype.createYeomanFiles = function createYeomanFiles() {
	this.template('Gruntfile.js')
	this.template('bowerrc', '.bowerrc')
	this.copy('package.json', 'package.json')
	this.copy('gitignore', '.gitignore')
	this.copy('gitattributes', '.gitattributes')
}

Generator.prototype.endGenerator = function endGenerator() {
	this.log.writeln('')
	this.log.writeln('Looks like we\'re done!')
	this.log.writeln('Now you just need to install Wordpress the usual way')
	this.log.writeln('Don\'t forget to activate the new theme in the admin panel, and then you can start coding!')
	this.log.writeln('')
}