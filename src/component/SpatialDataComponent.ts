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
    private _spatial: Spatial = new Spatial();
    private _geoCoords: GeoCoords = new GeoCoords();

    private _scene: THREE.Scene;
    private _grid: THREE.Object3D;
    private _cameraGroup: THREE.Object3D;
    private _cameras: { [key: string]: THREE.Object3D } = {};
    private _ccColors: { [cc: string]: string } = {};

    public get threejsScene(): THREE.Scene { return this._scene; }

    public setup(): void {
        this._scene = new THREE.Scene();
        this._grid = this._createGrid();
        this._scene.add(this._grid);

        this._cameraGroup = new THREE.Object3D;
        this._scene.add(this._cameraGroup);
    }

    public reset(): void {
        this.dispose();
        this.setup();
    }

    public dispose(): void {
        this._scene.remove(this._grid);
        this._disposeObject(this._grid);

        this._scene.remove(this._cameraGroup);
        this._disposeObject(this._cameraGroup);
        this._cameras = {};

        this._scene = undefined;
    }

    public updateCameras(nodes: Node[], reference: ILatLonAlt): void {
        for (let node of nodes) {
            if (!(node.key in this._cameras)) {
                let translation: number[] = this._nodeToTranslation(node, reference);
                let transform: Transform = new Transform(node, null, translation);
                let geometry: THREE.Geometry = this._cameraGeometry(transform, 1.0);
                let color: string;
                if (node.mergeCC in this._ccColors) {
                    color = this._ccColors[node.mergeCC];
                } else {
                    color = this._randomColor();
                    this._ccColors[node.mergeCC] = color;
                }
                let material: THREE.LineBasicMaterial = new THREE.LineBasicMaterial({color: color});
                let camera: THREE.LineSegments = new THREE.LineSegments(geometry, material);
                this._cameras[node.key] = camera;
                this._cameraGroup.add(camera);
            }
        }
    }

    private _createGrid(): THREE.Object3D {
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
    private _nodeToTranslation(node: Node, reference: ILatLonAlt): number[] {
        let C: number[] = this._geoCoords.geodeticToEnu(
            node.latLon.lat,
            node.latLon.lon,
            node.alt,
            reference.lat,
            reference.lon,
            reference.alt);

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

    private _cameraGeometry(transform: Transform, size: number): THREE.Geometry {
        let origin: number [] = transform.unprojectBasic([0, 0], 0);
        let topLeft: number[] = transform.unprojectBasic([0, 0], size);
        let topRight: number[] = transform.unprojectBasic([1, 0], size);
        let bottomRight: number[] = transform.unprojectBasic([1, 1], size);
        let bottomLeft: number[] = transform.unprojectBasic([0, 1], size);
        let geometry: THREE.Geometry = new THREE.Geometry();
        geometry.vertices.push(this._toV3(origin));
        geometry.vertices.push(this._toV3(topLeft));
        geometry.vertices.push(this._toV3(origin));
        geometry.vertices.push(this._toV3(topRight));
        geometry.vertices.push(this._toV3(origin));
        geometry.vertices.push(this._toV3(bottomRight));
        geometry.vertices.push(this._toV3(origin));
        geometry.vertices.push(this._toV3(bottomLeft));
        geometry.vertices.push(this._toV3(topLeft));
        geometry.vertices.push(this._toV3(topRight));
        geometry.vertices.push(this._toV3(topRight));
        geometry.vertices.push(this._toV3(bottomRight));
        // geometry.vertices.push(this._toV3(bottomRight));
        // geometry.vertices.push(this._toV3(bottomLeft));
        geometry.vertices.push(this._toV3(bottomLeft));
        geometry.vertices.push(this._toV3(topLeft));
        return geometry;
    }

    private _toV3(v: number[]): THREE.Vector3 {
        return new THREE.Vector3(v[0], v[1], v[2]);
    }
}


export class SpatialDataComponent extends Component<IComponentConfiguration> {
    public static componentName: string = "spatialData";

    private _renderSubscription: Subscription;
    private _graphChangeSubscription: Subscription;
    private _resetSubscription: Subscription;

    private _scene: Scene = new Scene();


    constructor(name: string, container: Container, navigator: Navigator) {
        super(name, container, navigator);
        console.log("constructing");
    }

    protected _activate(): void {
        console.log("activating");
        this._scene = new Scene();
        this._scene.setup();

        let nodes$: Observable<Node[]> = this._navigator.graphService.graph$
            .map(this._nodesFromGraph);

        this._resetSubscription = this._navigator.stateService.reference$
            .subscribe((reference: ILatLonAlt) => {
                this._scene.reset();
            });

        this._graphChangeSubscription = Observable
            .combineLatest([
                    nodes$,
                    this._navigator.stateService.reference$,
                ])
            .subscribe(
                ([nodes, reference]: [Node[], ILatLonAlt]): void => {
                    this._scene.updateCameras(nodes, reference);
                });


        this._renderSubscription = this._navigator.stateService.currentState$
            .map(this._renderHash.bind(this))
            .subscribe(this._container.glRenderer.render$);
    }

    protected _deactivate(): void {
        // release memory
        this._scene.dispose();
        this._renderSubscription.unsubscribe();
        this._graphChangeSubscription.unsubscribe();
        this._resetSubscription.unsubscribe();
    }

    protected _getDefaultConfiguration(): IComponentConfiguration {
        return {};
    }

    private _renderHash(frame: IFrame): IGLRenderHash {
        // determine if render is needed while updating scene
        // specific properies.
        let needsRender: boolean = this._updateScene(frame);

        // return render hash with render function and
        // render in foreground.
        return {
            name: this._name,
            render: {
                frameId: frame.id,
                needsRender: needsRender,
                render: this._render.bind(this),
                stage: GLRenderStage.Foreground,
            },
        };
    }

    private _updateScene(frame: IFrame): boolean {
        if (!frame ||
            !frame.state.currentNode) {
            return false;
        }

        let needRender: boolean = false;

        return needRender;
    }

    private _render(
        perspectiveCamera: THREE.PerspectiveCamera,
        renderer: THREE.WebGLRenderer): void {

        renderer.render(this._scene.threejsScene, perspectiveCamera);
    }

    private _nodesFromGraph(graph: Graph): Node[] {
        let nodes: Node[] = [];
        for (let key in graph.nodes) {
            if (graph.nodes.hasOwnProperty(key)) {
                let node: Node = graph.nodes[key];
                if (node.full) {
                    nodes.push(node);
                }
            }
        }
        return nodes;
    }
}

ComponentService.register(SpatialDataComponent);
export default SpatialDataComponent;
