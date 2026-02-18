import resolve from '@rollup/plugin-node-resolve';

export default {
    input: 'src/plugin.js',
    output: {
        file: 'com.dreadheadhippy.ampdeckplus.sdPlugin/plugin.js',
        format: 'iife',
        name: 'AmpdeckPlus',
        sourcemap: false
    },
    plugins: [resolve()]
};
