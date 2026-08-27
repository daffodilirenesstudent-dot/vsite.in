'use client';

import React, { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Product } from '@/lib/supabase';
import Image from 'next/image';
import EditModal from '@/components/EditModal';
import toast from 'react-hot-toast';
import { compressImage } from '@/utils/compressImage';
import { ProductsList } from './ProductsList';
import { SiteInfo } from './SiteInfo';
import { usePlan } from '@/components/PlanContext';

// Subscription field and limit config per site type
const SITE_CONFIG = {
    Shop: {
        planKey: 'store_plan' as const,
        limitKey: 'shop_limit' as const,
        defaultPlan: 'base',
        productLimits: { base: 15, pro: 20 },
        icon: 'storefront',
        visitLabel: 'Visit Shop',
        nameLabel: 'Shop Name',
        timingsLabel: 'Shop Timings',
        timingsPlaceholder: 'e.g. Mon-Sat: 9AM - 9PM',
        productLabel: 'Product',
        productNamePlaceholder: 'e.g. Chocolate Cake',
        tabLabel: 'Products',
    },
    Menu: {
        planKey: 'menu_plan' as const,
        limitKey: 'menu_limit' as const,
        defaultPlan: 'menu_base',
        productLimits: { menu_base: 20, menu_pro: 25 },
        icon: 'restaurant',
        visitLabel: 'Visit Menu',
        nameLabel: 'Restaurant Name',
        timingsLabel: 'Operating Hours',
        timingsPlaceholder: 'e.g. Mon-Sun: 11AM - 11PM',
        productLabel: 'Item',
        productNamePlaceholder: 'e.g. Butter Chicken',
        tabLabel: 'Menu Items',
    },
};

export function ShopCard({ shop, subscription, siteType, isExpanded, onToggleExpand, onToggleLive, onUpdate, onDelete }: {
    shop: any;
    subscription: any;
    siteType: 'Shop' | 'Menu';
    isExpanded: boolean;
    onToggleExpand: () => void;
    onToggleLive: () => void;
    onUpdate: () => void;
    onDelete: () => void;
}) {
    const config = SITE_CONFIG[siteType];
    const { canGoLive } = usePlan();
    const [activeTab, setActiveTab] = useState<'products' | 'info'>('products');

    // Editing State
    const [editingSection, setEditingSection] = useState<'basic' | 'contact' | 'location' | 'product' | 'timings' | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Deletion State
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deleteConfirmationName, setDeleteConfirmationName] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    // Form Data
    const [formData, setFormData] = useState<any>({});
    const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
    const bannerInputRef = useRef<HTMLInputElement>(null);
    const bannerCameraInputRef = useRef<HTMLInputElement>(null);
    const productInputRef = useRef<HTMLInputElement>(null);
    const productCameraInputRef = useRef<HTMLInputElement>(null);

    // Initialize edit handlers
    const handleEditBasic = () => {
        setFormData({
            name: shop.name,
            tagline: shop.tagline || '',
            description: shop.description || ''
        });
        setEditingSection('basic');
    };

    const handleEditContact = () => {
        setFormData({
            phone: shop.contact_number || '',
            email: shop.email || '',
            whatsapp: shop.whatsapp_number || ''
        });
        setEditingSection('contact');
    };

    const handleEditLocation = () => {
        setFormData({
            location: shop.location || ''
        });
        setEditingSection('location');
    };

    const handleEditTimings = () => {
        setFormData({
            timings: shop.timing || ''
        });
        setEditingSection('timings');
    };

    const handleAddProduct = () => {
        const currentCount = shop.products?.length || 0;
        const plan = subscription?.[config.planKey] || config.defaultPlan;
        const limits = config.productLimits as Record<string, number>;
        const limit = limits[plan] || Object.values(limits)[0];

        if (currentCount >= limit) {
            toast.error(`${config.productLabel} limit reached (${limit} max). Upgrade to add more.`);
            return;
        }

        setEditingProduct({ name: '', price: 0, description: '', image_url: '' });
        setEditingSection('product');
    };

    const handleEditProduct = (product: Product) => {
        setEditingProduct({ ...product });
        setEditingSection('product');
    };

    const handleBannerClick = () => {
        bannerInputRef.current?.click();
    };

    const handleBannerCameraClick = () => {
        bannerCameraInputRef.current?.click();
    };

    const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Client-side file size validation (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            toast.error('Image is too large. Maximum size is 5MB.');
            return;
        }

        try {
            // Compress image before upload
            const compressed = await compressImage(file, { maxWidth: 1600, quality: 0.85 });
            const fileExt = compressed.name.split('.').pop() || 'jpg';
            const fileName = `banner-${shop.id}-${Date.now()}.${fileExt}`;
            const filePath = `${shop.slug}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(filePath, compressed);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('product-images')
                .getPublicUrl(filePath);

            const { error: dbError } = await supabase
                .from('sites')
                .update({ image_url: publicUrl })
                .eq('id', shop.id);

            if (dbError) throw dbError;

            onUpdate();
        } catch (error) {
            console.error('Error uploading banner:', error);
            toast.error('Failed to upload banner');
        }
    };

    // Save Handlers
    const handleSaveBasic = async () => {
        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('sites')
                .update({
                    name: formData.name,
                    tagline: formData.tagline,
                    description: formData.description
                })
                .eq('id', shop.id);

            if (error) throw error;
            onUpdate();
            setEditingSection(null);
        } catch (error) {
            console.error('Error saving basic info:', error);
            toast.error('Failed to save changes');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveContact = async () => {
        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('sites')
                .update({
                    contact_number: formData.phone,
                    email: formData.email,
                    whatsapp_number: formData.whatsapp || formData.phone
                })
                .eq('id', shop.id);

            if (error) throw error;
            onUpdate();
            setEditingSection(null);
        } catch (error) {
            console.error('Error saving contact:', error);
            toast.error('Failed to save changes');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveLocation = async () => {
        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('sites')
                .update({
                    location: formData.location
                })
                .eq('id', shop.id);

            if (error) throw error;
            onUpdate();
            setEditingSection(null);
        } catch (error) {
            console.error('Error saving location:', error);
            toast.error('Failed to save changes');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveTimings = async () => {
        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('sites')
                .update({
                    timing: formData.timings
                })
                .eq('id', shop.id);

            if (error) throw error;
            onUpdate();
            setEditingSection(null);
        } catch (error) {
            console.error('Error saving timings:', error);
            toast.error('Failed to save changes');
        } finally {
            setIsSaving(false);
        }
    };

    const handleProductImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !editingProduct) return;

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `prod-${Math.random()}.${fileExt}`;
            const filePath = `${shop.slug}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('product-images')
                .getPublicUrl(filePath);

            setEditingProduct({ ...editingProduct, image_url: publicUrl });
        } catch (error) {
            console.error('Error uploading product image:', error);
            toast.error('Failed to upload image');
        }
    };

    const handleSaveProduct = async () => {
        if (!editingProduct?.name || !editingProduct?.price) return;
        const parsedPrice = parseFloat(editingProduct.price.toString());
        if (isNaN(parsedPrice) || parsedPrice < 0 || parsedPrice > 999999) {
            toast.error('Please enter a valid price (0 - 999,999)');
            return;
        }
        setIsSaving(true);
        try {
            const productData = {
                name: editingProduct.name,
                price: parsedPrice,
                description: editingProduct.description,
                image_url: editingProduct.image_url,
                site_id: shop.id
            };

            if (editingProduct.id) {
                const { error } = await supabase
                    .from('products')
                    .update(productData)
                    .eq('id', editingProduct.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('products')
                    .insert([productData]);
                if (error) throw error;
            }

            onUpdate();
            setEditingSection(null);
            setEditingProduct(null);
        } catch (error) {
            console.error('Error saving product:', error);
            toast.error('Failed to save product');
        } finally {
            setIsSaving(false);
        }
    };

    // Delete Confirmation Logic
    const handleConfirmDelete = async () => {
        if (deleteConfirmationName !== shop.name) return;

        setIsDeleting(true);
        try {
            await onDelete();
            // Modal closes as component unmounts
        } catch (error) {
            console.error('Error deleting:', error);
            setIsDeleting(false);
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden transition-all duration-300">
            {/* Header */}
            <div className="p-4 md:p-6 flex items-center justify-between bg-white cursor-pointer group" onClick={onToggleExpand}>
                <div className="flex items-center gap-3 md:gap-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200 flex-shrink-0">
                        {shop.image_url ? (
                            <Image src={shop.image_url} alt={shop.name} width={48} height={48} className="object-cover w-full h-full" />
                        ) : (
                            <span className="material-symbols-outlined text-gray-400">{config.icon}</span>
                        )}
                    </div>
                    <div>
                        <h2 className="text-lg md:text-xl font-bold text-gray-900 leading-tight">{shop.name}</h2>
                        <a href={`/shop/${shop.slug}`} target="_blank" onClick={(e) => e.stopPropagation()} className="text-xs md:text-sm text-blue-600 hover:underline flex items-center gap-1 py-1">
                            {config.visitLabel} <span className="material-symbols-outlined text-[14px] md:text-[16px]">open_in_new</span>
                        </a>
                    </div>
                </div>

                <div className="flex items-center gap-2 md:gap-4">
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs font-medium text-gray-500 hidden md:inline">Live Status</span>
                        {canGoLive ? (
                            <button
                                onClick={onToggleLive}
                                className={`w-12 h-7 rounded-full p-1 transition-colors duration-200 ease-in-out ${shop.is_live ? 'bg-green-500' : 'bg-gray-300'} flex items-center`}
                                title={shop.is_live ? "Live" : "Draft"}
                            >
                                <div className={`w-5 h-5 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${shop.is_live ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                        ) : (
                            <a
                                href="/manage/subscription"
                                className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-200 transition-colors"
                                title="Trial ended — activate a plan to go live"
                            >
                                <span className="material-symbols-outlined text-[14px]">lock</span>
                                Activate
                            </a>
                        )}
                    </div>
                    <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
                        <span className={`material-symbols-outlined transform transition-transform duration-300 text-gray-500 ${isExpanded ? 'rotate-180' : ''}`}>
                            expand_more
                        </span>
                    </button>
                </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="border-t border-gray-100">
                    <div className="border-b border-gray-100 px-4 md:px-6 flex">
                        <button
                            onClick={() => setActiveTab('products')}
                            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'products' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                        >
                            {config.tabLabel}
                        </button>
                        <button
                            onClick={() => setActiveTab('info')}
                            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'info' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                        >
                            Site Info
                        </button>
                    </div>

                    <div className="p-6 bg-gray-50/50">
                        {activeTab === 'products' ? (
                            <ProductsList
                                shop={shop}
                                onAdd={handleAddProduct}
                                onEdit={handleEditProduct}
                            />
                        ) : (
                            <SiteInfo
                                shop={shop}
                                siteType={siteType}
                                onEditBasic={handleEditBasic}
                                onEditContact={handleEditContact}
                                onEditLocation={handleEditLocation}
                                onEditBanner={handleBannerClick}
                                onEditBannerCamera={handleBannerCameraClick}
                                onEditTimings={handleEditTimings}
                                onDeleteClick={() => setIsDeleteModalOpen(true)}
                            />
                        )}
                        <input type="file" ref={bannerInputRef} onChange={handleBannerUpload} className="hidden" accept="image/*" />
                        <input type="file" ref={bannerCameraInputRef} onChange={handleBannerUpload} className="hidden" accept="image/*" capture="environment" />
                    </div>
                </div>
            )}

            {/* Edit Basic Info Modal */}
            <EditModal
                isOpen={editingSection === 'basic'}
                onClose={() => setEditingSection(null)}
                title="Edit Basic Information"
                onSave={handleSaveBasic}
                isSaving={isSaving}
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{config.nameLabel}</label>
                        <input
                            type="text"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                            value={formData.name || ''}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tagline</label>
                        <input
                            type="text"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                            value={formData.tagline || ''}
                            onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea
                            rows={3}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none"
                            value={formData.description || ''}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        />
                    </div>
                </div>
            </EditModal>

            {/* Edit Contact Modal */}
            <EditModal
                isOpen={editingSection === 'contact'}
                onClose={() => setEditingSection(null)}
                title="Edit Contact Details"
                onSave={handleSaveContact}
                isSaving={isSaving}
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                        <input
                            type="text"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                            value={formData.phone || ''}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp Number</label>
                        <input
                            type="text"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                            value={formData.whatsapp || ''}
                            onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                            placeholder="Same as phone if empty"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                        <input
                            type="email"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                            value={formData.email || ''}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        />
                    </div>
                </div>
            </EditModal>

            {/* Edit Location Modal */}
            <EditModal
                isOpen={editingSection === 'location'}
                onClose={() => setEditingSection(null)}
                title="Edit Location"
                onSave={handleSaveLocation}
                isSaving={isSaving}
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                        <input
                            type="text"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                            value={formData.location || ''}
                            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                            placeholder="City, Area, or Full Address"
                        />
                    </div>
                </div>
            </EditModal>

            {/* Edit Timings Modal */}
            <EditModal
                isOpen={editingSection === 'timings'}
                onClose={() => setEditingSection(null)}
                title={`Edit ${config.timingsLabel}`}
                onSave={handleSaveTimings}
                isSaving={isSaving}
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{config.timingsLabel}</label>
                        <input
                            type="text"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                            value={formData.timings || ''}
                            onChange={(e) => setFormData({ ...formData, timings: e.target.value })}
                            placeholder={config.timingsPlaceholder}
                        />
                    </div>
                </div>
            </EditModal>

            {/* Edit Product Modal */}
            <EditModal
                isOpen={editingSection === 'product'}
                onClose={() => { setEditingSection(null); setEditingProduct(null); }}
                title={editingProduct?.id ? `Edit ${config.productLabel}` : `Add New ${config.productLabel}`}
                onSave={handleSaveProduct}
                isSaving={isSaving}
                saveLabel={editingProduct?.id ? 'Save Changes' : `Add ${config.productLabel}`}
            >
                <div className="space-y-6">
                    <div className="flex justify-center gap-4">
                        <div
                            onClick={() => productInputRef.current?.click()}
                            className="relative w-32 h-32 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-primary hover:bg-blue-50 transition-all group overflow-hidden bg-gray-50"
                        >
                            {editingProduct?.image_url ? (
                                <Image src={editingProduct.image_url} alt="Preview" fill className="object-cover" />
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-3xl text-gray-400 group-hover:text-primary transition-colors">add_photo_alternate</span>
                                    <span className="text-xs text-gray-500 mt-1 font-medium">Gallery</span>
                                </>
                            )}
                            <input
                                type="file"
                                ref={productInputRef}
                                onChange={handleProductImageUpload}
                                className="hidden"
                                accept="image/*"
                            />
                        </div>

                        <div
                            onClick={() => productCameraInputRef.current?.click()}
                            className="relative w-32 h-32 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-primary hover:bg-blue-50 transition-all group overflow-hidden bg-gray-50"
                        >
                            <>
                                <span className="material-symbols-outlined text-3xl text-gray-400 group-hover:text-primary transition-colors">photo_camera</span>
                                <span className="text-xs text-gray-500 mt-1 font-medium">Camera</span>
                            </>
                            <input
                                type="file"
                                ref={productCameraInputRef}
                                onChange={handleProductImageUpload}
                                className="hidden"
                                accept="image/*"
                                capture="environment"
                            />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{config.productLabel} Name</label>
                            <input
                                type="text"
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                value={editingProduct?.name || ''}
                                onChange={(e) => setEditingProduct(prev => prev ? { ...prev, name: e.target.value } : null)}
                                placeholder={config.productNamePlaceholder}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Price (₹)</label>
                            <input
                                type="number"
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                value={editingProduct?.price || ''}
                                onChange={(e) => setEditingProduct(prev => prev ? { ...prev, price: Math.max(0, parseFloat(e.target.value) || 0) } : null)}
                                placeholder="0.00"
                                min="0"
                                step="0.01"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
                            <textarea
                                rows={2}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none"
                                value={editingProduct?.description || ''}
                                onChange={(e) => setEditingProduct(prev => prev ? { ...prev, description: e.target.value } : null)}
                                placeholder={`Brief description of the ${config.productLabel.toLowerCase()}...`}
                            />
                        </div>
                    </div>
                </div>
            </EditModal>

            {/* Delete Confirmation Modal */}
            {isDeleteModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl transform transition-all animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-3 text-red-600 mb-4">
                            <span className="material-symbols-outlined text-3xl">warning</span>
                            <h3 className="text-xl font-bold">Delete {siteType === 'Shop' ? 'Website' : 'Menu'}?</h3>
                        </div>

                        <p className="text-gray-600 mb-6 leading-relaxed">
                            This action cannot be undone. This will permanently delete
                            <span className="font-bold text-gray-900 mx-1">{shop.name}</span>
                            and all of its data.
                        </p>

                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Please type <span className="font-bold select-all">{shop.name}</span> to confirm.
                            </label>
                            <input
                                type="text"
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none"
                                value={deleteConfirmationName}
                                onChange={(e) => setDeleteConfirmationName(e.target.value)}
                                placeholder={shop.name}
                                autoFocus
                            />
                        </div>

                        <div className="flex items-center gap-3 justify-end">
                            <button
                                onClick={() => {
                                    setIsDeleteModalOpen(false);
                                    setDeleteConfirmationName('');
                                }}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                disabled={deleteConfirmationName !== shop.name || isDeleting}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isDeleting ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Deleting...
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-sm">delete</span>
                                        Delete
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
