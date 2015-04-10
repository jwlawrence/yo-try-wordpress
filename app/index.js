//'use strict';
var wrench       = require('wrench');
var util         = require('util');
var path         = require('path');
var fs           = require('fs');
var yeoman       = require('yeoman-generator');
var git          = require('simple-git')();
var querystring  = require('querystring');
var request      = require('request');
var https        = require('https');
var EventEmitter = require('events').EventEmitter;
var rimraf       = require('rimraf');
var exec         = require('child_process').exec;
var mysql        = require('mysql');
var semver       = require('semver');
var config       = require('./../config.js');

function Generator(args, options) {
	yeoman.generators.Base.apply(this, arguments);
	this.sourceRoot(path.join(__dirname, 'templates'));
	this.on('end', function() {
		this.installDependencies({
			skipInstall: options['skip-install']
		});
	});
}

util.inherits(Generator, yeoman.generators.NamedBase);

// try to find the config file and read the infos to set the prompts default values
Generator.prototype.getConfig = function getConfig() {
	var cb = this.async();
	var self = this;

	self.configExists = false;

	config.getConfig(function(err, data) {
		if (!err) {
			self.configExists = true;
		}
		self.defaultAuthorEmail = data.authorEmail;
		self.defaultAuthorName = data.authorName;
		self.defaultAuthorURI = data.authorURI;
		self.defaultTheme = data.themeUrl || "https://github.com/webershandwick/try-theme";
		self.buildTool = data.buildTool || "https://github.com/Yahosh/try-gulp";
		self.latestVersion = data.latestVersion;
		cb();
	});
};

// get the latest stable version of Wordpress
Generator.prototype.getVersion = function getVersion() {
	var cb = this.async();
	var self = this;

	this.log.writeln('');
	this.log.writeln('Trying to get the latest stable version of Wordpress');

	// try to get the latest version using the git tags
	try {
		var version = exec('git ls-remote --tags git@github.com:WordPress/WordPress.git', function(err, stdout, stderr) {
			if (err !== null) {
				self.log.writeln('exec error: ' + err);
			} else {
				var pattern = /\d\.\d[\.\d]*/ig;
				var match = stdout.match(pattern);
				var patternShort = /^\d\.\d$/;
				var latestVersion = match[match.length - 1];
				var semverLatestString = latestVersion;
				var semverVersionString = self.latestVersion;

				if (semverLatestString.match(patternShort)) semverLatestString += '.0';
				if (semverVersionString.match(patternShort)) semverVersionString += '.0';
				if (semverLatestString !== null && typeof semverLatestString !== 'undefined') { // update config if needed
					if (semver.gt(semverLatestString, semverVersionString)) {
						self.log.writeln('Updating config with latest version: ' + latestVersion);
						config.updateWordpressVersion(latestVersion);
					}
					self.latestVersion = latestVersion;
					self.log.writeln('Latest version: ' + self.latestVersion);
				}
			}
			cb();
		});
	} catch (e) {
		cb();
	}
};

// ask questions
Generator.prototype.askFor = function askFor() {
	var cb = this.async();
	var self = this;

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
		}, {
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
		}, {
			name: 'siteName',
			message: 'Enter the name of your WordPress site',
			validate: requiredValidate
		}, {
			name: 'userName',
			message: 'Enter your WordPress username',
			validate: requiredValidate
		}, {
			type: 'password',
			name: 'userPassword',
			message: 'Enter your WordPress password',
			validate: requiredValidate
		}, {
			name: 'userEmail',
			message: 'Enter your WordPress email address',
			validate: requiredValidate,
			default: self.defaultAuthorEmail
		}, {
			name: 'authorName',
			message: 'Enter the name of the developer(s) who will build this site',
			default: self.defaultAuthorName
		}, {
			name: 'authorURI',
			message: 'Enter the URL of the developer(s) who will build this site',
			default: self.defaultAuthorURI
		}, {
			name: 'dbHost',
			message: 'Enter the database host',
			default: 'localhost'
		}, {
			name: 'dbUser',
			message: 'Enter the database username',
			default: 'root'
		}, {
			name: 'dbPassword',
			message: 'Enter the database password',
			default: 'root'
		}, {
			name: 'dbName',
			message: 'Enter the database name',
			validate: requiredValidate
		}, {
			name: 'tablePrefix',
			message: 'Enter the database table prefix',
			default: 'try_wp_'
		}, {
			name: 'themeName',
			message: 'What should the theme directory be named?',
			default: 'try-theme'
		}, {
			name: 'themeBoilerplate',
			message: 'Starter theme (please provide a github link)',
			default: self.defaultTheme,
			filter: function(input) {
				return input.replace(/\ /g, '').toLowerCase();
			}
		}, {
			name: 'buildTool',
			message: 'Build tool (please provide a github link)',
			default: self.buildTool,
			filter: function(input) {
				return input.replace(/\ /g, '').toLowerCase();
			}
		}, {
			type: 'confirm',
			name: 'useGit',
			message: 'Initialize project as a git repo?',
			default: true
		}, {
			type: 'confirm',
			name: 'useMAMP',
			message: 'Install and config WordPress for MAMP? (if so start MAMP and setup a hostname before continuing)',
			default: true
		}
	];

	this.prompt(prompts, function(props) {

		self.siteName = props.siteName;
		self.userName = props.userName;
		self.userPassword = props.userPassword;
		self.userEmail = props.userEmail;
		self.url = props.url;
		self.dbHost = props.dbHost;
		self.dbName = props.dbName;
		self.dbUser = props.dbUser;
		self.dbPassword = props.dbPassword;
		self.tablePrefix = props.tablePrefix;
		self.wordpressVersion = props.wordpressVersion;
		self.themeOriginalURL = props.themeBoilerplate;
		self.themeBoilerplate = props.themeBoilerplate;
		self.themeNameOriginal = props.themeName;
		self.themeName = props.themeName;
		self.authorName = props.authorName;
		self.authorURI = props.authorURI;
		self.buildTool = props.buildTool;
		self.useGit = props.useGit;
		self.useMAMP = props.useMAMP;

		// check if the user only gave the repo url or the entire url with /archive/{branch}.tar.gz
		var gitLinks = [ 'buildTool', 'themeBoilerplate' ];

		gitLinks.forEach(function (el) {
			var tarballLink = (/[.]*archive\/[.]*.*.tar.gz/).test(self[el]);

			if (!tarballLink) { // if the user gave the repo url we add the end of the url. we assume he wants the master branch
				var lastChar = self[el].substring(self[el].length - 1);
				if (lastChar === '/') {
					self[el] = self[el] + 'archive/master.tar.gz';
				} else {
					self[el] = self[el] + '/archive/master.tar.gz';
				}
			}
		}, self);

		// create the config file it does not exist
		if (!self.configExists) {
			var values = {
				authorName: self.authorName,
				authorURI: self.authorURI,
				themeUrl: self.themeOriginalURL,
				buildTool: self.buildTool
			};
			config.createConfig(values, cb);
		} else {
			cb();
		}
	});
};

// download the framework and unzip it in the project app/
Generator.prototype.createApp = function createApp() {
	var cb = this.async();
	var self = this;

	this.log.writeln('Let\'s download the framework, shall we?');
	this.log.writeln('Downloading Wordpress version ' + self.wordpressVersion + ' please wait...');

	this.tarball('https://github.com/WordPress/WordPress/archive/' + self.wordpressVersion + '.tar.gz', 'app', cb);
};

// remove the basic theme and create a new one
Generator.prototype.createTheme = function createTheme() {
	var cb = this.async();
	var self = this;

	this.log.writeln('Now let\'s remove the built-in themes we will not use');

	fs.readdir('app/wp-content/themes', function(err, files) { // remove the existing themes
		if (typeof files != 'undefined' && files.length !== 0) {
			files.forEach(function(file) {
				var pathFile = fs.realpathSync('app/wp-content/themes/' + file),
					isDirectory = fs.statSync(pathFile).isDirectory();

				if (isDirectory) {
					rimraf.sync(pathFile);
					self.log.writeln('Removing ' + pathFile);
				}
			});
		}

		self.log.writeln('');
		self.log.writeln('Now we can download our starter theme');

		// create the theme
		self.tarball(self.themeBoilerplate, 'app/wp-content/themes/' + self.themeName, cb);
	});
};

// download build tool and unzip
Generator.prototype.addGulp = function addGulp() {
	var cb = this.async();
	var self = this;

	this.log.writeln('Next, we\'ll add the build tool');

    self.tarball(self.buildTool, './', cb);
}

// wp-config setup
Generator.prototype.wpConfig = function() {
	var cb = this.async();
	var self = this;

	function getSaltKeys(callback) {
		var ee = new EventEmitter();
		var keys = '';

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
		self.log.writeln('Salt keys: ' + JSON.stringify(saltKeys, null, '  '));
		self.log.writeln('');

		self.saltKeys = saltKeys;
		self.template('wp-config.php', 'wp-config.php');
		self.template('local-config.php', 'local-config.php');

		cb();
	}
	getSaltKeys(createConfigs);
};

// Create and configure database
Generator.prototype.setupDb = function() {
	var cb = this.async();
	var self = this;

	if (this.useMAMP === true) {
		var connection = mysql.createConnection({
			socketPath: '/Applications/MAMP/tmp/mysql/mysql.sock',
			user: self.dbUser,
			password: self.dbPassword
		});

		// CONNECT TO SERVER
		self.log.writeln('Connecting to database server');
		connection.connect(function(err) {
			if (err) {
				self.log.writeln(err);
				cb();
				return;
			}

			// CREATE DB
			self.log.writeln('Creating database');
			connection.query('CREATE DATABASE IF NOT EXISTS ' + mysql.escapeId(self.dbName), function(err, rows, fields) {
				if (err) {
					self.log.writeln(err);
					cb();
					return;
				}

				// INSTALL WORDPRESS
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
				}, function(err, res, body) {
					if (err) {
						self.log.writeln('WP install error');
						self.log.writeln(err);
						cb();
						return;
					}

					// SETUP THEME
					self.log.writeln('Configuring WordPress');
					connection.query("USE " + self.dbName, function (err, rows, fields) {
					    if (err) {
							self.log.writeln(err);
							cb();
							return;
						}

						var q = [
							"UPDATE " + self.tablePrefix + "options ",
							"SET `option_value` = " + mysql.escape(self.themeName) + " ",
							"WHERE `option_name` = 'template' ",
							"OR `option_name` = 'stylesheet';"
						].join('\n');

						connection.query(q, function(err, rows, fields) {
							if (err) {
								self.log.writeln(err);
								cb();
								return;
							}

							// CLOSE CONNECTION
							self.log.writeln('Closing connection to database server');
							connection.end(function() {
								cb();
							});
						});
					});
				});
			});
		});
	}
};

// generate the files to use Yeoman and the git related files
Generator.prototype.createYeomanFiles = function createYeomanFiles() {
	this.copy('htaccess', '.htaccess');
	this.template('gulp-config.js', 'gulp/config.js');
	this.template('Movefile', 'Movefile');
	this.template('README', 'README.md');
};

// Set some permissions
Generator.prototype.setPermissions = function() {
	if (fs.existsSync('.')) {
		this.log.writeln('Setting Permissions: 0755 on .');
		wrench.chmodSyncRecursive('.', 0755);
		this.log.writeln('Done setting permissions on .');
	}
};

// Git setup
Generator.prototype.initGit = function() {
	var self = this;

	// Using Git? Init it project repo
	if (self.useGit === true) {
		var cb = this.async();

		// Initialize git, add files, and commit
		self.log.writeln('Initializing git repo');
		git.init(function(err) {
			if (err) {
				self.log.writeln(err);
			}

			self.log.writeln('Git init complete');
			git.add('.', function(err) {
				if (err) {
					self.log.writeln(err);
				}
			}).commit('Initial Commit', function(err, d) {
				if (err) {
					self.log.writeln(err);
				}
				self.log.writeln('Git add and commit complete: ' + JSON.stringify(d, null, '  '));
				cb();
			});
		});
	}
};

Generator.prototype.endGenerator = function endGenerator() {
	var self = this;
	this.log.writeln('');
	this.log.writeln('Looks like we\'re done!');
	this.log.writeln('Visit '+ self.url +' to view your new Wordpress site.');
	this.log.writeln('');
};

module.exports = Generator;