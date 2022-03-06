import * as fs from "fs";
import {
    Application,
    JSX,
    DefaultTheme,
    PageEvent,
    Reflection,
    DefaultThemeRenderContext,
    Options,
    ReflectionKind,
    ContainerReflection,
    ProjectReflection,
    UrlMapping,
    DeclarationReflection,
    ParameterType,
} from "typedoc";

enum OptionValue {
    README = "readme",
    STATIC_MARKDOWN_FILES = "staticMarkdownDocs",
    CUSTOM_NAVIGATION = "customNavigations",
}

type StaticMarkdownDocs = {
    pageUrl: string;
    filePath: string;
};

type CustomNavigations = {
    title: string;
    links: {
        label: string;
        href: string;
    }[];
};

export const load = (app: Application) => {
    app.renderer.hooks.on("body.begin", (_) => (
        <script>
            <JSX.Raw html="console.log(`[Natuna Typedoc] Generating: ${location.href}`)" />
        </script>
    ));

    app.renderer.defineTheme("natuna", CustomTheme);

    app.options.addDeclaration({
        type: ParameterType.Mixed,
        name: OptionValue.STATIC_MARKDOWN_FILES,
        help: "An Array of Markdown files to be included in the docs.",
        defaultValue: [],
    });

    app.options.addDeclaration({
        type: ParameterType.Mixed,
        name: OptionValue.CUSTOM_NAVIGATION,
        help: "An Array of custom navigation items.",
        defaultValue: [],
    });
};

export class CustomTheme extends DefaultTheme {
    #contextCache?: CustomThemeElement;

    getRenderContext(): CustomThemeElement {
        this.#contextCache ||= new CustomThemeElement(this, this.application.options);
        return this.#contextCache;
    }

    getUrls(project: ProjectReflection): UrlMapping[] {
        const urls: UrlMapping[] = [];
        project.url = "index.html";

        if (false == !this.application.options.getValue(OptionValue.README).endsWith("none")) {
            urls.push(new UrlMapping<ContainerReflection>("index.html", project, this.reflectionTemplate));
        } else {
            urls.push(new UrlMapping<ContainerReflection>("modules.html", project, this.reflectionTemplate));
            urls.push(new UrlMapping("index.html", project, this.indexTemplate));
        }

        urls.push(...this.getStaticMarkdownFiles(project));

        project.children?.forEach((child: Reflection) => {
            if (child instanceof DeclarationReflection) {
                this.buildUrls(child, urls);
            }
        });

        return urls;
    }

    getStaticMarkdownFiles = (project: ProjectReflection) => {
        let files = [];
        const markdowns = this.application.options.getValue(OptionValue.STATIC_MARKDOWN_FILES) as StaticMarkdownDocs[];

        if (markdowns && Array.isArray(markdowns) && markdowns.length > 0) {
            for (const markdown of markdowns) {
                files.push(
                    new UrlMapping(`${markdown.pageUrl}.html`, project, () => {
                        return this.getRenderContext().markdownTemplate(markdown.filePath);
                    })
                );
            }
        }

        return files;
    };
}

export class CustomThemeElement extends DefaultThemeRenderContext {
    constructor(theme: DefaultTheme, options: Options) {
        super(theme, options);
    }

    navigation = (props: PageEvent<Reflection>) => {
        const navigations = this.options.getValue(OptionValue.CUSTOM_NAVIGATION) as CustomNavigations[];

        if (navigations && !Array.isArray(navigations)) {
            throw new Error("Custom navigation must be an array of array.");
        }

        for (const item of navigations) {
            if (!Array.isArray(item.links)) {
                throw new Error("Custom navigation must be an array of objects.");
            }
        }

        return (
            <>
                <div class="tsd-navigation primary">
                    {navigations.map((navigation) => (
                        <>
                            <JSX.Raw html={this.markdown(`## ${navigation.title}`)} />

                            {navigation.links.map((links) => (
                                <JSX.Raw html={this.markdown(`- [${links.label}](${links.href})`)} />
                            ))}
                        </>
                    ))}
                </div>

                {this.secondaryNavigation(props)}
            </>
        );
    };

    markdownTemplate = (location: string) => {
        if (!fs.existsSync(location)) {
            throw new Error(`Could not find markdown template at ${location}`);
        }

        const file = fs.readFileSync(location, "utf8");

        return (
            <div class="tsd-panel tsd-typography">
                <JSX.Raw html={this.markdown(file)} />
            </div>
        );
    };

    secondaryNavigation(props: PageEvent<Reflection>) {
        const children = props.model instanceof ContainerReflection ? props.model.children || [] : [];

        // Remove navigations from the main page (e.g. "Home")
        if (props.model.isProject()) return null;

        return (
            <nav class="tsd-navigation secondary menu-sticky">
                <ul>
                    <li class={"current " + props.model.cssClasses}>
                        <a href={this.urlTo(props.model)} class="tsd-kind-icon">
                            {this.utils.wbr(props.model.name)}
                        </a>
                        <ul>
                            {children
                                .filter((child) => !child.kindOf(ReflectionKind.SomeModule))
                                .map((child) => {
                                    return (
                                        <li class={child.cssClasses}>
                                            <a href={this.urlTo(child)} class="tsd-kind-icon">
                                                {this.utils.wbr(child.name)}
                                            </a>
                                        </li>
                                    );
                                })}
                        </ul>
                    </li>
                </ul>
            </nav>
        );
    }

    utils = {
        wbr(str: string): (string | JSX.Element)[] {
            // TODO surely there is a better way to do this, but I'm tired.
            const ret: (string | JSX.Element)[] = [];
            const re = /[\s\S]*?(?:([^_-][_-])(?=[^_-])|([^A-Z])(?=[A-Z][^A-Z]))/g;
            let match: RegExpExecArray | null;
            let i = 0;
            while ((match = re.exec(str))) {
                ret.push(match[0]);
                ret.push(<wbr />);
                i += match[0].length;
            }
            ret.push(str.slice(i));

            return ret;
        },
    };
}
