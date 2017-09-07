export class Urls {
    public static get tileScheme(): string {
        return "https";
    }

    public static get tileDomain(): string {
        return "d2qb1440i7l50o.cloudfront.net";
    }

    public static get origin(): string {
        return "mapillary.webgl";
    }

    public static thumbnail(key: string, size: number): string {
        return `/data/images/${key}`;
    }

    public static falcorModel(clientId: string): string {
        return `https://a.mapillary.com/v3/model.json?client_id=${clientId}`;
    }

    public static protoMesh(key: string): string {
        return `/data/atomic/${key}.atomic_mesh.pbf`;
    }
}

export default Urls;
