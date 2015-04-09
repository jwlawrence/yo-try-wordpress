module.exports = {
	domain: "<%= url %>",
	paths: {
		root: "./app",
    theme: "./app/wp-content/themes/<%= themeName %>",
    scripts: "./app/wp-content/themes/<%= themeName %>/scripts",
    styles: "./app/wp-content/themes/<%= themeName %>/styles",
    images: "./app/wp-content/themes/<%= themeName %>/images",
    dist: "./app/wp-content/themes/<%= themeName %>/dist"
	}
}