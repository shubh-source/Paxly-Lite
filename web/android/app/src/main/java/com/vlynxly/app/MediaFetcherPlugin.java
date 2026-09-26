package com.vlynxly.app;

import android.content.ContentUris;
import android.database.Cursor;
import android.provider.MediaStore;
import android.Manifest;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

@CapacitorPlugin(
    name = "MediaFetcher",
    permissions = {
        @Permission(
            alias = "storage",
            strings = {
                Manifest.permission.READ_MEDIA_IMAGES,
                Manifest.permission.READ_EXTERNAL_STORAGE
            }
        )
    }
)
public class MediaFetcherPlugin extends Plugin {

    @PluginMethod
    public void getRecentMedia(PluginCall call) {
        if (!hasPermission("storage")) {
            requestPermissionForAlias("storage", call, "storagePermsCallback");
            return;
        }
        fetchMedia(call);
    }

    @PluginMethod
    public void storagePermsCallback(PluginCall call) {
        if (hasPermission("storage")) {
            fetchMedia(call);
        } else {
            call.reject("Permission is required to access media");
        }
    }

    private void fetchMedia(PluginCall call) {
        int limit = call.getInt("limit", 30);
        JSArray mediaList = new JSArray();

        String[] projection = new String[]{
                MediaStore.Images.Media._ID,
                MediaStore.Images.Media.DATA,
                MediaStore.Images.Media.DATE_ADDED
        };

        String sortOrder = MediaStore.Images.Media.DATE_ADDED + " DESC";

        try (Cursor cursor = getContext().getContentResolver().query(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                projection,
                null,
                null,
                sortOrder
        )) {
            if (cursor != null) {
                int idColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID);
                int dataColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATA);
                
                int count = 0;
                while (cursor.moveToNext() && count < limit) {
                    long id = cursor.getLong(idColumn);
                    String dataPath = cursor.getString(dataColumn);
                    
                    if (dataPath != null && !dataPath.isEmpty()) {
                        JSObject mediaItem = new JSObject();
                        mediaItem.put("id", String.valueOf(id));
                        mediaItem.put("path", dataPath);
                        mediaList.put(mediaItem);
                        count++;
                    }
                }
            }
        } catch (Exception e) {
            call.reject("Failed to fetch media", e);
            return;
        }

        JSObject ret = new JSObject();
        ret.put("media", mediaList);
        call.resolve(ret);
    }
}
