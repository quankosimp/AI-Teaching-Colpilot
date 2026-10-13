import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import ProductApp from './product/App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProductApp />
  </StrictMode>,
);
