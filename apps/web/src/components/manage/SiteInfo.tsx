'use client';

import React from 'react';
import Image from 'next/image';
import PosterGenerator from '@/components/PosterGenerator';

export function SiteInfo({
    shop,
    siteType,
    onEditBasic,
    onEditContact,
    onEditLocation,
    onEditBanner,
    onEditBannerCamera,
    onEditTimings,
    onDeleteClick
}: {
    shop: any;
    siteType: 'Shop' | 'Menu';
    onEditBasic: () => void;
    onEditContact: () => void;
    onEditLocation: () => void;
    onEditBanner: () => void;
    onEditBannerCamera: () => void;
    onEditTimings: () => void;
    onDeleteClick: () => void;
}) {
    const isShop = siteType === 'Shop';
    const nameLabel = isShop ? 'Shop Name' : 'Restaurant Name';
    const timingsLabel = isShop ? 'Shop Timings' : 'Operating Hours';

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column: Basic Info */}
            <div className="space-y-6">
                <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm relative group hover:border-blue-200 transition-colors">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                            <span className="material-symbols-outlined text-gray-400">info</span> Basic Information
                        </h3>
                        <button onClick={onEditBasic} className="text-gray-400 hover:text-blue-600 p-2 hover:bg-blue-50 rounded-lg transition-colors">
                            <span className="material-symbols-outlined text-sm">edit</span>
                        </button>
                    </div>

                    <div className="space-y-5">
                        <div>
                            <label className="text-xs font-bold text-gray-400 uppercase block mb-1">{nameLabel}</label>
                            <p className="font-medium text-gray-900 text-lg">{shop.name}</p>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Tagline</label>
                            <p className="font-medium text-gray-700">{shop.tagline || <span className="text-gray-400 italic">No tagline added</span>}</p>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Description</label>
                            <p className="text-sm text-gray-600 leading-relaxed">{shop.description || <span className="text-gray-400 italic">No description added</span>}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm relative group hover:border-blue-200 transition-colors">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                            <span className="material-symbols-outlined text-gray-400">contact_phone</span> Contact Details
                        </h3>
                        <button onClick={onEditContact} className="text-gray-400 hover:text-blue-600 p-2 hover:bg-blue-50 rounded-lg transition-colors">
                            <span className="material-symbols-outlined text-sm">edit</span>
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                                <span className="material-symbols-outlined text-sm">call</span>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase block">Phone</label>
                                <p className="font-medium text-gray-900">{shop.contact_number || '-'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center text-green-600">
                                <span className="material-symbols-outlined text-sm">chat</span>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase block">WhatsApp</label>
                                <p className="font-medium text-gray-900">{shop.whatsapp_number || shop.contact_number || '-'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center text-orange-600">
                                <span className="material-symbols-outlined text-sm">mail</span>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase block">Email</label>
                                <p className="font-medium text-gray-900">{shop.email || '-'}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>


            {/* Right Column: Banner & Contact & Location */}
            <div className="space-y-6">
                {/* Marketing Assets */}
                <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm relative group hover:border-blue-200 transition-colors">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="font-bold text-gray-900 flex items-center gap-2">
                            <span className="material-symbols-outlined text-gray-400">campaign</span> Marketing Assets
                        </h4>
                    </div>
                    <div className="flex flex-col items-center">
                        <PosterGenerator
                            siteName={shop.name}
                            siteUrl={`${typeof window !== 'undefined' ? window.location.origin : ''}/shop/${shop.slug}`}
                            siteType={siteType}
                        />
                    </div>
                </div>

                {/* Site Banner */}
                <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm relative group hover:border-blue-200 transition-colors">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="font-bold text-gray-900 flex items-center gap-2">
                            <span className="material-symbols-outlined text-gray-400">image</span> Site Banner
                        </h4>
                        <div className="flex gap-2">
                            <button onClick={onEditBanner} className="text-gray-400 hover:text-blue-600 p-2 hover:bg-blue-50 rounded-lg transition-colors" title="Upload from Gallery">
                                <span className="material-symbols-outlined text-sm">add_photo_alternate</span>
                            </button>
                            <button onClick={onEditBannerCamera} className="text-gray-400 hover:text-blue-600 p-2 hover:bg-blue-50 rounded-lg transition-colors" title="Take Photo">
                                <span className="material-symbols-outlined text-sm">photo_camera</span>
                            </button>
                        </div>
                    </div>
                    <div className="h-48 bg-gray-100 rounded-lg flex items-center justify-center relative overflow-hidden group/image ">
                        {shop.image_url ? (
                            <>
                                <Image src={shop.image_url} alt="Banner" fill className="object-cover" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/image:opacity-100 transition-opacity flex items-center justify-center gap-4">
                                    <button onClick={onEditBanner} className="p-2 bg-white rounded-full text-gray-700 hover:text-blue-600 transition-colors" title="Gallery">
                                        <span className="material-symbols-outlined">add_photo_alternate</span>
                                    </button>
                                    <button onClick={onEditBannerCamera} className="p-2 bg-white rounded-full text-gray-700 hover:text-blue-600 transition-colors" title="Camera">
                                        <span className="material-symbols-outlined">photo_camera</span>
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center gap-4 text-gray-400">
                                <span className="text-sm font-medium">Upload Banner</span>
                                <div className="flex gap-4">
                                    <button onClick={onEditBanner} className="flex flex-col items-center gap-1 hover:text-blue-500 transition-colors">
                                        <span className="material-symbols-outlined text-3xl">add_photo_alternate</span>
                                        <span className="text-xs">Gallery</span>
                                    </button>
                                    <button onClick={onEditBannerCamera} className="flex flex-col items-center gap-1 hover:text-blue-500 transition-colors">
                                        <span className="material-symbols-outlined text-3xl">photo_camera</span>
                                        <span className="text-xs">Camera</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Location Info */}
                <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm relative group hover:border-blue-200 transition-colors">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="font-bold text-gray-900 flex items-center gap-2">
                            <span className="material-symbols-outlined text-gray-400">location_on</span> Location
                        </h4>
                        <button onClick={onEditLocation} className="text-gray-400 hover:text-blue-600 p-2 hover:bg-blue-50 rounded-lg transition-colors">
                            <span className="material-symbols-outlined text-sm">edit</span>
                        </button>
                    </div>
                    <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-blue-600 shadow-sm shrink-0">
                            <span className="material-symbols-outlined text-xl">map</span>
                        </div>
                        <div>
                            <p className="font-bold text-gray-900 mb-1">Address</p>
                            <p className="text-gray-700 leading-relaxed">{shop.location || 'No location address added.'}</p>
                        </div>
                    </div>
                </div>

                {/* Timings Info */}
                <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm relative group hover:border-blue-200 transition-colors">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="font-bold text-gray-900 flex items-center gap-2">
                            <span className="material-symbols-outlined text-gray-400">schedule</span> {timingsLabel}
                        </h4>
                        <button onClick={onEditTimings} className="text-gray-400 hover:text-blue-600 p-2 hover:bg-blue-50 rounded-lg transition-colors">
                            <span className="material-symbols-outlined text-sm">edit</span>
                        </button>
                    </div>
                    <div className="flex items-start gap-4 p-4 bg-purple-50 rounded-lg border border-purple-100">
                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-purple-600 shadow-sm shrink-0">
                            <span className="material-symbols-outlined text-xl">timer</span>
                        </div>
                        <div>
                            <p className="font-bold text-gray-900 mb-1">Opening Hours</p>
                            <p className="text-gray-700 leading-relaxed">{shop.timing || 'No timings added.'}</p>
                        </div>
                    </div>
                </div>

                {/* Delete Website Section */}
                <div className="bg-white p-6 rounded-xl border border-red-100 shadow-sm relative group hover:border-red-200 transition-colors">
                    <div className="flex items-center justify-between">
                        <h4 className="font-bold text-red-600 flex items-center gap-2">
                            <span className="material-symbols-outlined">delete_forever</span> Danger Zone
                        </h4>
                        <button
                            onClick={onDeleteClick}
                            className="text-red-600 hover:text-white border border-red-200 hover:bg-red-600 px-4 py-2 rounded-lg transition-all text-sm font-medium flex items-center gap-2"
                        >
                            <span className="material-symbols-outlined text-sm">delete</span>
                            Delete Website
                        </button>
                    </div>
                    <p className="text-gray-500 text-xs mt-2">
                        Permanently delete this website and all its data. This action cannot be undone.
                    </p>
                </div>

            </div>
        </div>
    );
}
