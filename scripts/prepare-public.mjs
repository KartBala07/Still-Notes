import {copyFileSync} from 'node:fs';
copyFileSync(new URL('./local-companion.py',import.meta.url),new URL('../public/local-companion.py',import.meta.url));
