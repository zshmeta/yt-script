import ytScript from './src/cli.js';

ytScript().then(() => {
    console.log('done');
}).catch(err => {
    console.error('An error occurred:', err);
});
