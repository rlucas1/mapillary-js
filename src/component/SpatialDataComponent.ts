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



export class SpatialDataComponent extends Component<IComponentConfiguration> {
    public static componentName: string = "spatialData";

    private _disposable: Subscription;
    private _graphChangeSubscription: Subscription;

    private _spatial: Spatial = new Spatial();
    private _geoCoords: GeoCoords = new GeoCoords();

    // scene objects
    private _scene: THREE.Scene;
    private _grid: THREE.Object3D;
    private _cameraGroup: THREE.Object3D;
    private _cameras: { [key: string]: THREE.Object3D } = {};

    constructor(name: string, container: Container, navigator: Navigator) {
        super(name, container, navigator);
        console.log("constructing");
    }

    protected _activate(): void {
        console.log("activating");
        this._setUpScene();

        let nodes$: Observable<Node[]> = this._navigator.graphService.graph$
            .map(this._nodesFromGraph);

        this._graphChangeSubscription = Observable
            .combineLatest([
                    nodes$,
                    this._navigator.stateService.reference$,
                ])
            .subscribe(
                ([nodes, reference]: [Node[], ILatLonAlt]): void => {
                    this._updateCameras(nodes, reference);
                });


        this._disposable = this._navigator.stateService.currentState$
            .map(this._renderHash.bind(this))
            .subscribe(this._container.glRenderer.render$);
    }

    protected _deactivate(): void {
        // release memory
        this._disposeScene();
        this._disposable.unsubscribe();
        this._graphChangeSubscription.unsubscribe();
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

        renderer.render(this._scene, perspectiveCamera);
    }

    private _setUpScene(): void {
        this._scene = new THREE.Scene();
        this._grid = this._createGrid();
        this._scene.add(this._grid);

        this._cameraGroup = new THREE.Object3D;
        this._scene.add(this._cameraGroup);
    }

    private _createGrid(): THREE.Object3D {
        let linegeo: THREE.Geometry = new THREE.Geometry();
        let N: number = 20;
        let scale: number = 2;
        for (let i: number = 0; i <= 2 * N; ++i) {
            linegeo.vertices.push(
                new THREE.Vector3(scale * (i - N), scale * (-N), 0),
                new THREE.Vector3(scale * (i - N), scale * ( N), 0),
                new THREE.Vector3(scale * (-N), scale * (i - N), 0),
                new THREE.Vector3(scale * ( N), scale * (i - N), 0)
            );
        }
        let lineMaterial: THREE.LineBasicMaterial = new THREE.LineBasicMaterial({color: 0x555555});
        let line: THREE.LineSegments = new THREE.LineSegments(linegeo, lineMaterial);

        let group: THREE.Object3D = new THREE.Object3D();
        group.add(line);
        return group;
    }

    /*
    private _disposeObject(object: THREE.Object3D): void {
        this._scene.remove(object);
        for (let i: number = 0; i < object.children.length; ++i) {
            let c: THREE.Mesh = <THREE.Mesh> object.children[i];
            c.geometry.dispose();
            c.material.dispose();
        }
    }
    */

    private _disposeScene(): void {
        // todo(pau)
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

    private _updateCameras(nodes: Node[], reference: ILatLonAlt): void {
        for (let node of nodes) {
            if (!(node.key in this._cameras)) {
                let translation: number[] = this._nodeToTranslation(node, reference);
                let transform: Transform = new Transform(node, null, translation);
                let geometry: THREE.Geometry = this._cameraGeometry(transform, 1.0);
                let material: THREE.LineBasicMaterial = new THREE.LineBasicMaterial({color: 0xCCCCCC});
                let camera: THREE.LineSegments = new THREE.LineSegments(geometry, material);
                this._cameras[node.key] = camera;
                this._cameraGroup.add(camera);
            }
        }
    }

    private _cameraGeometry(transform: Transform, size: number): THREE.Geometry {
        let width: number = transform.width;
        let height: number = transform.height;
        let dx: number = width / 2.0 / Math.max(width, height);
        let dy: number = height / 2.0 / Math.max(width, height);
        let origin: number [] = transform.unprojectBasic([0, 0], 0);
        let topLeft: number[] = transform.unprojectBasic([-dx, -dy], size);
        let topRight: number[] = transform.unprojectBasic([ dx, -dy], size);
        let bottomRight: number[] = transform.unprojectBasic([ dx,  dy], size);
        let bottomLeft: number[] = transform.unprojectBasic([-dx,  dy], size);
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

ComponentService.register(SpatialDataComponent);
export default SpatialDataComponent;
