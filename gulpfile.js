const gulp = require('gulp');
const ts = require('gulp-typescript');
const fs = require('fs');
const path = require('path');
const project = ts.createProject('tsconfig.json');
gulp.task('compile', () => {
    return gulp.src('src/**/*.ts')
        .pipe(project())
        .pipe(gulp.dest('dist/'));
});
gulp.task('copy-static', () => {
    return gulp.src(['src/module.json', 'src/lang/**', 'src/templates/**', 'src/styles/**', 'src/assets/**'], { base: 'src', allowEmpty: true })
        .pipe(gulp.dest('dist/'));
});
gulp.task('copy-readme', () => {
    return gulp.src('README.md', { allowEmpty: true }).pipe(gulp.dest('dist/'));
});
gulp.task('bundle-themes', async () => {
    if (!fs.existsSync('dist')) fs.mkdirSync('dist');
    const themesDir = path.join(__dirname, 'src', 'themes');
    if (fs.existsSync(themesDir)) {
        const themeFiles = fs.readdirSync(themesDir).filter(f => f.endsWith('.json'));
        const themes = themeFiles.map(f => JSON.parse(fs.readFileSync(path.join(themesDir, f), 'utf8')));
        fs.writeFileSync(path.join(__dirname, 'dist', 'themes.json'), JSON.stringify(themes, null, 2));
    }
});
gulp.task('copy', gulp.parallel('copy-static', 'copy-readme', 'bundle-themes'));
gulp.task('build', gulp.parallel('compile', 'copy'));
// Configuração de Deploy Automático para o Foundry VTT
const MODULEPATH = "D:/FoundryVTT-WindowsPortable-14.359/Data/modules/journal-css/";
gulp.task('foundry', () => {
    return gulp.src('dist/**')
        .pipe(gulp.dest(MODULEPATH));
});
gulp.task("update", gulp.series('build', 'foundry'));
