
import React from 'react';
import { Comercio } from '../types';

interface LoginPageProps {
  comercios: Comercio[];
  onLogin: (comercioId: string) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ comercios, onLogin }) => {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-extrabold text-gray-900">Acceso Comerciantes</h1>
        <p className="mt-2 text-lg text-gray-600">
          Seleccioná tu comercio de la lista para administrar tu ficha.
        </p>
      </div>
      <div className="bg-white p-8 rounded-xl shadow-lg space-y-4">
        {comercios.map(comercio => (
          <div 
            key={comercio.id}
            className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
          >
            <div className="flex items-center">
              <img src={comercio.imagenUrl} alt={comercio.nombre} className="w-16 h-16 object-cover rounded-md mr-4" />
              <span className="font-semibold text-lg text-gray-800">{comercio.nombre}</span>
            </div>
            <button
              onClick={() => onLogin(comercio.id)}
              className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Administrar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LoginPage;
