//'use strict';

var wrench = require('wrench'),
	util = require('util'),
	path = require('path'),
	fs = require('fs'),
	yeoman = require('yeoman-generator'),
	git = require('simple-git')(),
	querystring = require('querystring'),
	request = require('request'),
	https = require('https'),
	EventEmitter = require('events').EventEmitter,
	rimraf = require('rimraf'),
	exec = require('child_process').exec,
	mysql = require('mysql'),
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
			name: 'wordpressVersion',
			message: 'Which version of Wordpress do you want?',
			default: self.latestVersion
		},
		{
			name: 'siteName',
			message: 'Your WordPress site name',
			validate: requiredValidate
		},
		{
			name: 'userName',
			message: 'Your WordPress username',
			validate: requiredValidate
		},
		{
			type: 'password',
			name: 'userPassword',
			message: 'Your WordPress password',
			validate: requiredValidate
		},
		{
			name: 'userEmail',
			message: 'Your WordPress email',
			validate: requiredValidate
		},
		{
			name: 'url',
			message: 'Your WordPress URL',
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
			name: 'dbHost',
			message: 'Database host',
			default: 'localhost'
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
			name: 'dbName',
			message: 'Database name',
			validate: requiredValidate
		},
		{
			name: 'tablePrefix',
			message: 'Database table prefix',
			default: 'try_wp_'
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
			type: 'confirm',
			name: 'useGit',
			message: 'Init a git repo?',
			default: true
		},
		{
			type: 'confirm',
			name: 'useMAMP',
			message: 'Are you using MAMP? (if so start it now)',
			default: true
		}
		// ,{
		// 	name: 'includeRequireJS',
		// 	type: 'confirm',
		// 	message: 'Would you like to include RequireJS (for AMD support)?'
		// }
	]

	this.prompt(prompts, function(props) {

		// set the property to parse the gruntfile
		self.siteName = props.siteName
		self.userName = props.userName
		self.userPassword = props.userPassword
		self.userEmail = props.userEmail
		self.url = props.url
		self.dbHost = props.dbHost
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
		self.useGit = props.useGit
		self.useMAMP = props.useMAMP
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

// wp-config setup
Generator.prototype.wpAdmin = function() {
	var cb = this.async(),
		self = this

	function getSaltKeys(callback) {
		var ee = new EventEmitter(),
			keys = '';

		https.get("https://api.wordpress.org/secret-key/1.1/salt/", function(res) {
			res.on('data', function(d) {
				keys += d.toString();
			}).on('end', function() {
				ee.emit('end', keys);
			});
		});

		if (typeof callback === 'function') {
			ee.on('end', callback);
		}

		return ee;
	}

	function createConfigs(saltKeys) {
		self.log.writeln('Salt keys: ' + JSON.stringify(saltKeys, null, '  '))
		self.saltKeys = saltKeys

		self.log.writeln('Copying wp-config')
		self.template('wp-config.php', 'wp-config.php');

		self.log.writeln('Copying local-config')
		self.template('local-config.php', 'local-config.php');
		cb();
	};

	getSaltKeys(createConfigs);

}

/**
 * TODO: fix callback structure
 * TODO: fix connection error https://github.com/felixge/node-mysql#connection-options
 */
// Create Database
Generator.prototype.createDatabase = function() {
	if (this.useMAMP === true) {
		var cb = this.async();
		var self = this;

		self.log.writeln('Connecting to Database')

		var connection = mysql.createConnection({
			socketPath: '/Applications/MAMP/tmp/mysql/mysql.sock',
			user: self.dbUser,
			password: self.dbPassword
		});

		connection.connect(function(err) {
			if (err) { self.log.writeln(err) };

			self.log.writeln('Creating Database')
			connection.query('CREATE DATABASE IF NOT EXISTS ' + mysql.escapeId(self.dbName), function(err, rows, fields) {
				if (err) { self.log.writeln(err) };
			});

			// INSTALL WORDPRESS...
			self.log.writeln('Installing WordPress');
			request.post({
				uri: self.url + '/wp-admin/install.php?step=2',
				form: {
					'blog_public': 1,
					'weblog_title': self.siteTitle,
					'user_name': self.userName,
					'admin_password': self.userPassword,
					'admin_password2': self.userPassword,
					'admin_email': self.userEmail
				}
			}, function (err, res, body) {
				if (err) { self.log.writeln(err) };

				// SETUP THEME
				self.log.writeln('Setting up theme');

				// var q = [
				// 	"USE " + mysql.escapeId(self.dbName) + " ",
				// 	"UPDATE '" + self.tablePrefix + "options' ",
				// 	"SET option_value =  " + mysql.escape(self.themeName) + " ",
				// 	"WHERE option_name = 'template' ",
				// 	"OR option_name = 'stylesheet'"
				// ].join('\n');

				//var q = "USE yeoman; UPDATE try_wp_options SET option_value = 'try-theme' WHERE option_name = 'template' OR option_name = 'stylesheet'";

				connection.query(q, function(err, rows, fields) {
					if (err) { self.log.writeln(err) };
				});

				connection.end(function() {
					self.log.writeln('db connection closed');
					cb();
				});

			});

		});
	}
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
	this.copy('jshintrc', '.jshintrc')
	this.copy('package.json', 'package.json')
	this.copy('editorconfig', '.editorconfig')
}

// Set some permissions
Generator.prototype.setPermissions = function() {
	if (fs.existsSync('.')) {
		this.log.writeln('Setting Permissions: 0755 on .')
		wrench.chmodSyncRecursive('.', 0755);
		this.log.writeln('Done setting permissions on .')
	}
}

// Git setup
Generator.prototype.initGit = function() {

	var self = this;

	// Using Git?  Init it...
	if (self.useGit === true) {
		var cb = this.async();

		// Copy .gitignore & .getattributes files
		self.copy('gitignore', '.gitignore');
		self.copy('gitattributes', '.gitattributes')
		self.log.writeln('Initializing Git')

		// Initialize git, add files, and commit
		git.init(function(err) {
			if (err) { self.log.writeln(err) };

			self.log.writeln('Git init complete')

			git.add('.', function(err) {
				if (err) { self.log.writeln(err) };
			}).commit('Initial Commit', function(err, d) {
				if (err) { self.log.writeln(err) };
				self.log.writeln('Git add and commit complete: ' + JSON.stringify(d, null, '  '));
				cb();
			});
		});
	}

}

Generator.prototype.endGenerator = function endGenerator() {
	this.log.writeln('')
	this.log.writeln('Looks like we\'re done!')
	this.log.writeln('Now you just need to install Wordpress the usual way')
	this.log.writeln('Don\'t forget to activate the new theme in the admin panel, and then you can start coding!')
	this.log.writeln('')
}