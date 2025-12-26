import React from 'react';
import { Comercio, Ciudad, Provincia, Rubro } from '../types';

interface BusinessCardProps {
  comercio: Comercio;
  ciudad: Ciudad;
  provincia: Provincia;
  rubro: Rubro;
}

const BusinessCard: React.FC<BusinessCardProps> = ({ comercio, ciudad, rubro }) => {
  const rating = comercio.rating || 4.5;
  const reviewCount = comercio.reviewCount || Math.floor(Math.random() * 100);

  return (
    <div className="flex bg-white rounded-3xl p-3 shadow-sm border border-gray-50 hover:shadow-md transition-all gap-4 items-center">
      <div className="w-24 h-24 flex-shrink-0 relative">
        <img 
          src={comercio.imagenUrl} 
          alt={comercio.nombre} 
          className="w-full h-full object-cover rounded-2xl shadow-inner"
        />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{rubro.nombre}</p>
          <span className="text-[10px] bg-green-50 text-green-600 px-2 py-0.5 rounded-full font-black">ABIERTO</span>
        </div>
        
        <h3 className="text-lg font-bold text-gray-900 truncate mt-0.5">{comercio.nombre}</h3>
        
        <div className="flex items-center gap-1 mt-1 text-sm">
          <span className="text-amber-400">★</span>
          <span className="font-bold text-gray-700">{rating}</span>
          <span className="text-gray-300 ml-1">📍 {ciudad.nombre}</span>
        </div>
      </div>

      <div className="pr-2">
         <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-300">
           &hearts;
         </div>
      </div>
    </div>
  );
};

export default BusinessCard;