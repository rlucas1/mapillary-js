/// <reference path="../../typings/index.d.ts" />

import * as THREE from "three";

import {Observable} from "rxjs/Observable";
import {Subscription} from "rxjs/Subscription";

import "rxjs/add/observable/combineLatest";

import "rxjs/add/operator/distinctUntilChanged";
import "rxjs/add/operator/filter";
import "rxjs/add/operator/map";
import "rxjs/add/operator/publishReplay";
import "rxjs/add/operator/scan";
import "rxjs/add/operator/switchMap";

import {
    ComponentService,
    Component,
    IComponentConfiguration,
} from "../Component";
import {IFrame} from "../State";
import {Container, Navigator} from "../Viewer";
import {IGLRenderHash, GLRenderStage} from "../Render";
import {
    GeoCoords,
    ILatLonAlt,
    Spatial,
    Transform,
} from "../Geo";
import {Node, Graph} from "../Graph";


interface IDisposable {
    geometry?: THREE.Geometry;
    material?: THREE.Material;
}


class Scene {
    public needsRender: boolean = false;

    private _spatial: Spatial = new Spatial();
    private _geoCoords: GeoCoords = new GeoCoords();

    private _reference: ILatLonAlt;
    private _scene: THREE.Scene;
    private _grid: THREE.Object3D;
    private _cameraGroup: THREE.Object3D;
    private _cameras: { [key: string]: THREE.Object3D } = {};
    private _ccColors: { [cc: string]: string } = {};
    private _gpsGroup: THREE.Object3D;
    private _pointsGroup: THREE.Object3D;
    private _tile: THREE.Object3D;

    // options
    private _showCameras: boolean = true;
    private _showGPS: boolean = true;
    private _showPoints: boolean = true;
    private _showGrid: boolean = true;
    private _showTile: boolean = true;
    private _tileURL: string;

    public get threejsScene(): THREE.Scene { return this._scene; }

    public setup(reference: ILatLonAlt): void {
        this._reference = reference;

        this._scene = new THREE.Scene();
        this._grid = this._gridObject();
        this._scene.add(this._grid);

        this._tile = this._tileObject(this._reference);
        this._scene.add(this._tile);

        this._cameraGroup = new THREE.Object3D;
        this._scene.add(this._cameraGroup);

        this._gpsGroup = new THREE.Object3D;
        this._scene.add(this._gpsGroup);

        this._pointsGroup = new THREE.Object3D;
        this._scene.add(this._pointsGroup);

        this.needsRender = true;
    }

    public dispose(): void {
        if (this._grid) {
            this._scene.remove(this._grid);
            this._disposeObject(this._grid);
            this._grid = undefined;
        }

        if (this._cameraGroup) {
            this._scene.remove(this._cameraGroup);
            this._disposeObject(this._cameraGroup);
            this._cameras = {};
            this._cameraGroup = undefined;
        }

        if (this._gpsGroup) {
            this._scene.remove(this._gpsGroup);
            this._disposeObject(this._gpsGroup);
            this._gpsGroup = undefined;
        }

        if (this._pointsGroup) {
            this._scene.remove(this._pointsGroup);
            this._disposeObject(this._pointsGroup);
            this._pointsGroup = undefined;
        }

        if (this._tile) {
            this._scene.remove(this._tile);
            this._tile = undefined;
        }

        this._scene = undefined;
    }

    public reset(reference: ILatLonAlt): void {
        this.dispose();
        this.setup(reference);
    }

    public fetchAtomic(node: Node): void {
        let url: string = `https://s3-eu-west-1.amazonaws.com/mapillary.private.images/${node.key}/sfm/v1.0/atomic_reconstruction.json`;

        let xmlHTTP: XMLHttpRequest = new XMLHttpRequest();
        xmlHTTP.open("GET", url, true);
        xmlHTTP.timeout = 15000;
        xmlHTTP.onload = (pe: ProgressEvent) => {
            this.loadPoints(node, JSON.parse(xmlHTTP.response));
        };
        xmlHTTP.onerror = (e: Event) => {
            console.log("Error downloading atomic reconstruction", e);
        };
        xmlHTTP.send();
    }

    public loadPoints(node: Node, reconstruction: any): void {
        let translation: number[] = this._nodeToTranslation(node);
        let transform: Transform = new Transform(node, null, translation);

        let isrt: THREE.Matrix4 = new THREE.Matrix4().getInverse(transform.srt);

        let matParams: THREE.PointsMaterialParameters = {};
        matParams.size = 1;
        let material: THREE.PointsMaterial = new THREE.PointsMaterial({
            size: 1,
            sizeAttenuation: false,
            vertexColors: THREE.VertexColors,
        });

        let geometry: THREE.Geometry = new THREE.Geometry();
        for (let key of Object.keys(reconstruction.points)) {
            let pa: number[] = reconstruction.points[key].coordinates;
            let p: THREE.Vector3 = new THREE.Vector3(pa[0], pa[1], pa[2]);
            p.applyMatrix4(isrt);
            let c: number[] = reconstruction.points[key].color;
            let color: THREE.Color = new THREE.Color();
            color.setRGB(c[0] / 255.0, c[1] / 255.0, c[2] / 255.0);
            geometry.vertices.push(p);
            geometry.colors.push(color);
        }

        this._pointsGroup.add(new THREE.Points(geometry, material));
    }

    public updateCameras(nodes: Node[]): void {
        for (let node of nodes) {
            if (!(node.key in this._cameras)) {
                let camera: THREE.LineSegments = this._cameraObject(node);
                this._cameras[node.key] = camera;
                this._cameraGroup.add(camera);

                this._gpsGroup.add(this._gpsObject(node));

                this.fetchAtomic(node);
            }
        }
    }

    public setTileURL(url: string): void {
        this._tileURL = url;
    }

    public setShowCameras(v: boolean): void {
        if (this._showCameras !== v) {
            this._showCameras = v;
            this._cameraGroup.visible = v;
            this.needsRender = true;
        }
    }

    public setShowGPS(v: boolean): void {
        if (this._showGPS !== v) {
            this._showGPS = v;
            this._gpsGroup.visible = v;
            this.needsRender = true;
        }
    }

    public setShowPoints(v: boolean): void {
        if (this._showPoints !== v) {
            this._showPoints = v;
            this._pointsGroup.visible = v;
            this.needsRender = true;
        }
    }

    public setShowGrid(v: boolean): void {
        if (this._showGrid !== v) {
            this._showGrid = v;
            this._grid.visible = v;
            this.needsRender = true;
        }
    }

    public setShowTile(v: boolean): void {
        if (this._showTile !== v) {
            this._showTile = v;
            this._tile.visible = v;
            this.needsRender = true;
        }
    }

    private _cameraObject(node: Node): THREE.LineSegments {
        let translation: number[] = this._nodeToTranslation(node);
        let transform: Transform = new Transform(node, null, translation);
        let geometry: THREE.Geometry = this._cameraGeometry(transform, 1.0);
        let material: THREE.LineBasicMaterial = this._cameraMaterial(node);
        return new THREE.LineSegments(geometry, material);
    }

    private _cameraGeometry(transform: Transform, size: number): THREE.Geometry {
        let origin: number [] = transform.unprojectBasic([0, 0], 0);
        let topLeft: number[] = transform.unprojectBasic([0, 0], size);
        let topRight: number[] = transform.unprojectBasic([1, 0], size);
        let bottomRight: number[] = transform.unprojectBasic([1, 1], size);
        let bottomLeft: number[] = transform.unprojectBasic([0, 1], size);
        let geometry: THREE.Geometry = new THREE.Geometry();
        geometry.vertices.push(
            this._toV3(origin), this._toV3(topLeft),
            this._toV3(origin), this._toV3(topRight),
            this._toV3(origin), this._toV3(bottomRight),
            this._toV3(origin), this._toV3(bottomLeft),
            this._toV3(topLeft), this._toV3(topRight),
            this._toV3(topRight), this._toV3(bottomRight),
            // this._toV3(bottomRight), this._toV3(bottomLeft),
            this._toV3(bottomLeft), this._toV3(topLeft));
        return geometry;
    }

    private _cameraMaterial(node: Node): THREE.LineBasicMaterial {
        let color: string;
        if (node.mergeCC in this._ccColors) {
            color = this._ccColors[node.mergeCC];
        } else {
            color = this._randomColor();
            this._ccColors[node.mergeCC] = color;
        }
        return new THREE.LineBasicMaterial({color: color});
    }

    private _gpsObject(node: Node): THREE.LineSegments {
        let cameraCenter: number[] = this._geoCoords.geodeticToEnu(
            node.computedLatLon.lat, node.computedLatLon.lon, node.alt,
            this._reference.lat, this._reference.lon, this._reference.alt);
        let gpsCenter: number[] = this._geoCoords.geodeticToEnu(
            node.originalLatLon.lat, node.originalLatLon.lon, 2,
            this._reference.lat, this._reference.lon, this._reference.alt);

        let geometry: THREE.Geometry = new THREE.Geometry();
        geometry.vertices.push(this._toV3(cameraCenter),
                               this._toV3(gpsCenter));

        let material: THREE.LineBasicMaterial = new THREE.LineBasicMaterial({ color: 0xff00ff });
        return new THREE.LineSegments(geometry, material);
    }

    private _tileObject(reference: ILatLonAlt): THREE.Object3D {
        function lon2tile(lon: number, zoom: number): number {
            return Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
        }
        function lat2tile(lat: number, zoom: number): number {
            return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) +
                               1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
        }
        function tile2lon(x: number, z: number): number {
            return x / Math.pow(2, z) * 360 - 180;
        }
        function tile2lat(y: number, z: number): number {
            let n: number = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
            return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
        }

        let z: number = 17;
        let x: number = lon2tile(reference.lon, z);
        let y: number = lat2tile(reference.lat, z);

        let minLon: number = tile2lon(x, z);
        let maxLon: number = tile2lon(x + 1, z);
        let minLat: number = tile2lat(y + 1, z);
        let maxLat: number = tile2lat(y, z);

        let topLeft: number[] = this._geoCoords.geodeticToEnu(
            maxLat, minLon, -2, reference.lat, reference.lon, reference.alt);
        let bottomRight: number[] = this._geoCoords.geodeticToEnu(
            minLat, maxLon, -2, reference.lat, reference.lon, reference.alt);

        let width: number = bottomRight[0] - topLeft[0];
        let height: number = topLeft[1] - bottomRight[1];
        let geometry: THREE.Geometry = new THREE.PlaneGeometry(width, height);

        let textureLoader: THREE.TextureLoader = new THREE.TextureLoader();
        let url: string = this._tileURL.replace(/{z}/, `${z}`).replace(/{x}/, `${x}`).replace(/{y}/, `${y}`);
        let texture: THREE.Texture = textureLoader.load(url);

        let material: THREE.MeshBasicMaterial = new THREE.MeshBasicMaterial({map: texture});
        let mesh: THREE.Mesh = new THREE.Mesh(geometry, material);
        mesh.position.x = (topLeft[0] + bottomRight[0]) / 2;
        mesh.position.y = (topLeft[1] + bottomRight[1]) / 2;
        mesh.position.z = (topLeft[2] + bottomRight[2]) / 2;
        return mesh;
    }

    private _gridObject(): THREE.Object3D {
        let geometry: THREE.Geometry = new THREE.Geometry();
        let N: number = 20;
        let scale: number = 2;
        for (let i: number = 0; i <= 2 * N; ++i) {
            geometry.vertices.push(
                new THREE.Vector3(scale * (i - N), scale * (-N), 0),
                new THREE.Vector3(scale * (i - N), scale * ( N), 0),
                new THREE.Vector3(scale * (-N), scale * (i - N), 0),
                new THREE.Vector3(scale * ( N), scale * (i - N), 0)
            );
        }
        let material: THREE.LineBasicMaterial = new THREE.LineBasicMaterial({color: 0x555555});
        let line: THREE.LineSegments = new THREE.LineSegments(geometry, material);

        let group: THREE.Object3D = new THREE.Object3D();
        group.add(line);
        return group;
    }

    private _disposeObject(object: THREE.Object3D): void {
        if (object !== null) {
            for (let i: number = 0; i < object.children.length; i++) {
                this._disposeObject(object.children[i]);
            }
            let disposable: IDisposable = object as IDisposable;
            if (disposable.geometry) {
                disposable.geometry.dispose();
                disposable.geometry = undefined;
            }
            if (disposable.material) {
                disposable.material.dispose();
                disposable.material = undefined;
            }
        }
    }

    // duplicated with StateBase._nodeToTranslation()
    private _nodeToTranslation(node: Node): number[] {
        let C: number[] = this._geoCoords.geodeticToEnu(
            node.latLon.lat,
            node.latLon.lon,
            node.alt,
            this._reference.lat,
            this._reference.lon,
            this._reference.alt);

        let RC: THREE.Vector3 = this._spatial.rotate(C, node.rotation);

        return [-RC.x, -RC.y, -RC.z];
    }

    private _randomColor(): string {
        let letters: string = "0123456789ABCDEF";
        let color: string = "#";
        for (let i: number = 0; i < 6; i++ ) {
            color += letters[Math.floor(Math.random() * 16)];
        }
        return color;
    }

    private _toV3(v: number[]): THREE.Vector3 {
        return new THREE.Vector3(v[0], v[1], v[2]);
    }
}


export class SpatialDataComponent extends Component<IComponentConfiguration> {
    public static componentName: string = "spatialData";

    private _renderSubscription: Subscription;
    private _graphChangeSubscription: Subscription;
    private _currentNodeSubscription: Subscription;
    private _resetSubscription: Subscription;

    private _scene: Scene = new Scene();


    constructor(name: string, container: Container, navigator: Navigator) {
        super(name, container, navigator);
    }

    public get scene(): Scene { return this._scene; }

    protected _activate(): void {
        let nodes$: Observable<Node[]> = this._navigator.graphService.graph$
            .map(this._nodesFromGraph);

        this._resetSubscription = this._navigator.stateService.reference$
            .subscribe((reference: ILatLonAlt) => {
                this._scene.reset(reference);
            });

        this._graphChangeSubscription = nodes$
            .subscribe((nodes: Node[]): void => {
                this._scene.updateCameras(nodes);
            });

        // this._currentNodeSubscription = this._navigator.stateService.currentNode$
        //     .subscribe((node: Node): void => {
        //         this._scene.setCurrentCamera(node);
        //     });

        this._renderSubscription = this._navigator.stateService.currentState$
            .map(this._renderHash.bind(this))
            .subscribe(this._container.glRenderer.render$);
    }

    protected _deactivate(): void {
        this._scene.dispose();
        this._renderSubscription.unsubscribe();
        this._graphChangeSubscription.unsubscribe();
        this._currentNodeSubscription.unsubscribe();
        this._resetSubscription.unsubscribe();
    }

    protected _getDefaultConfiguration(): IComponentConfiguration {
        return {};
    }

    private _renderHash(frame: IFrame): IGLRenderHash {
        // return render hash with render function and
        // render in foreground.
        return {
            name: this._name,
            render: {
                frameId: frame.id,
                needsRender: this._scene.needsRender,
                render: this._render.bind(this),
                stage: GLRenderStage.Foreground,
            },
        };
    }

    private _render(
        perspectiveCamera: THREE.PerspectiveCamera,
        renderer: THREE.WebGLRenderer): void {

        this._scene.needsRender = false;
        renderer.render(this._scene.threejsScene, perspectiveCamera);
    }

    private _nodesFromGraph(graph: Graph): Node[] {
        let nodes: Node[] = [];
        for (let key of Object.keys(graph.nodes)) {
            let node: Node = graph.nodes[key];
            if (node.full) {
                nodes.push(node);
            }
        }
        return nodes;
    }
}

ComponentService.register(SpatialDataComponent);
export default SpatialDataComponent;
