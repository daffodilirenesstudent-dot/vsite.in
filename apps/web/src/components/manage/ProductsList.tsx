'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Product } from '@/lib/supabase';
import toast from 'react-hot-toast';
import Image from 'next/image';

export function ProductsList({ shop, onAdd, onEdit }: { shop: any; onAdd: () => void; onEdit: (p: Product) => void }) {
    const products = shop.products || [];
    const [localProducts, setLocalProducts] = useState(products);

    // Sync local products when shop changes
    useEffect(() => {
        setLocalProducts(shop.products || []);
    }, [shop.products]);

    // Optimistic toggle for product live status
    const toggleProductLive = async (productId: string | undefined, currentStatus: boolean | undefined) => {
        if (!productId) return;
        const newStatus = !currentStatus;

        // Optimistic update
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setLocalProducts((prev: any[]) => prev.map((p: any) => p.id === productId ? { ...p, is_live: newStatus } : p));

        try {
            const { error } = await supabase.from('products').update({ is_live: newStatus }).eq('id', productId);
            if (error) throw error;
        } catch {
            // Revert optimistic update using functional form to avoid stale closure
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setLocalProducts((prev: any[]) => prev.map((p: any) => p.id === productId ? { ...p, is_live: currentStatus } : p));
            toast.error('Failed to update product. Please try again.');
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-bold text-gray-900">All Products</h3>
                    <p className="text-sm text-gray-500">Manage your store inventory</p>
                </div>
                <button
                    onClick={onAdd}
                    className="px-4 py-2 bg-white border border-gray-200 text-blue-600 hover:bg-blue-50 font-semibold rounded-lg text-sm flex items-center gap-2 shadow-sm transition-all hover:scale-105"
                >
                    <span className="material-symbols-outlined text-sm">add</span>
                    Add Product
                </button>
            </div>

            {localProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 bg-white rounded-lg border border-dashed border-gray-300 text-center">
                    <span className="material-symbols-outlined text-4xl text-gray-300 mb-2">inventory_2</span>
                    <p className="text-gray-500 text-sm">No products added yet.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-3">
                    {localProducts.map((product: any) => (
                        <div key={product.id ?? product.name} className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-xl group hover:shadow-md hover:border-blue-100 transition-all">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden relative border border-gray-200">
                                    {product.image_url ? (
                                        <Image src={product.image_url} alt={product.name} fill className="object-cover" />
                                    ) : (
                                        <span className="material-symbols-outlined absolute inset-0 flex items-center justify-center text-gray-400 text-sm">image</span>
                                    )}
                                </div>
                                <div>
                                    <span className="font-bold text-gray-900 block">{product.name}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-md">₹{product.price}</span>
                                        {product.description && <span className="text-xs text-gray-400 truncate max-w-[150px] hidden md:block">• {product.description}</span>}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2" title="Toggle Visibility">
                                    <button
                                        onClick={() => toggleProductLive(product.id, !!product.is_live)}
                                        className={`w-9 h-5 rounded-full p-0.5 transition-colors ${product.is_live !== false ? 'bg-blue-600' : 'bg-gray-300'}`}
                                    >
                                        <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform ${product.is_live !== false ? 'translate-x-4' : 'translate-x-0'}`} />
                                    </button>
                                </div>
                                <div className="h-6 w-px bg-gray-200"></div>
                                <button
                                    onClick={() => onEdit(product)}
                                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[20px]">edit</span>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
