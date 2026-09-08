import React from 'react';
import {createRoot} from 'react-dom/client';
import StillNotes from '../app/stillnotes';
import '../app/globals.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><StillNotes/></React.StrictMode>);
