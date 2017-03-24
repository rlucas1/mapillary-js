/// <reference path="../../../../typings/index.d.ts" />

import * as THREE from "three";

import {ILatLon} from "../../../API";

/**
 * @class Marker
 *
 * @classdesc Represents an abstract marker class that should be extended
 * by marker implementations used in the marker component.
 */
export abstract class Marker {
    protected _id: string;
    protected _geometry: THREE.Object3D;
    protected _latLon: ILatLon;

    constructor(id: string, latLon: ILatLon) {
        this._id = id;
        this._latLon = latLon;
    }

    /**
     * Get id.
     * @returns {string} The id of the marker.
     */
    public get id(): string {
        return this._id;
    }

    public get geometry(): THREE.Object3D {
        return this._geometry;
    }

    /**
     * Get lat lon.
     * @returns {ILatLon} The geographic coordinates of the marker.
     */
    public get latLon(): ILatLon {
        return this._latLon;
    }

    public createGeometry(position: number[]): void {
        if (!!this._geometry) {
            return;
        }

        this._createGeometry(position);
    }

    public disposeGeometry(): void {
        if (!this._geometry) {
            return;
        }

        this._disposeGeometry();

        this._geometry = undefined;
    }

    public getInteractiveObjectIds(): string[] {
        if (!this._geometry) {
            return [];
        }

        return this._getInteractiveObjectIds();
    }

    public lerpAltitude(alt: number, alpha: number): void {
        if (!this._geometry) {
            return;
        }

        this._geometry.position.z = (1 - alpha) * this._geometry.position.z + alpha * alt;
    }

    public updatePosition(position: number[], latLon?: ILatLon): void {
        if (!!latLon) {
            this._latLon.lat = latLon.lat;
            this._latLon.lon = latLon.lon;
        }

        if (!this._geometry) {
            return;
        }

        this._geometry.position.fromArray(position);
    }

    protected abstract _createGeometry(position: number[]): void;

    protected abstract _disposeGeometry(): void;

    protected abstract _getInteractiveObjectIds(): string[];
}

export default Marker;
