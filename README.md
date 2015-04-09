# Yeoman TRY WordPress Generator

Yeoman generator for WordPress projects utilizing try-theme and try-gulp.

### Disclaimer

This is not a very flexible script and I rarely maintain it. It's meant to simplify a specific dev process used by myself and a few of my coworkers and doesn't have many aspirations. In basic terms the script will:

- Fetch the most recent version of WordPress from GitHub
- Get the most recent version of the try-theme (or any starter theme) from GitHub
- Get the most recent version of the try-gulp build tool from GitHub (other tools may be used, but will probably require some tweaking)
- Generate wp-config.php and local-config.php files with your data
- If you're using MAMP it will also:
	- Create a database
	- Install WordPress with correct urls and theme settings in database

Feel free to modify it completely to your liking.

## Installation

You'll need Yeoman, so if you don't have it `npm install -g yo`

Install the module from npm with `npm install -g generator-try-wordpress`

## Usage

Navigate to the root directory of your project, run `yo try-wordpress` and follow the prompts.

Note: If you are using MAMP the generator will automatically install and configure WordPress for you. Make sure MAMP is running and the root directory for the app is set to '/path/to/project_root/app' (note the trailing '/app') before you initialize the generator.
