import * as fs from "fs";
import * as path from "path";
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
    REMOVE_PRIMARY_NAVIGATION = "removePrimaryNavigation",
    REMOVE_SECONDARY_NAVIGATION = "removeSecondaryNavigation",
    MARKDOWN_CONTENT_REPLACEMENT = "markdownFilesContentReplacement",
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

type MarkdownContentReplacement = {
    content: string;
    replacement: string;
};

export const load = (app: Application) => {
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

    app.options.addDeclaration({
        type: ParameterType.Boolean,
        name: OptionValue.REMOVE_PRIMARY_NAVIGATION,
        help: "Remove the primary navigation?",
        defaultValue: false,
    });

    app.options.addDeclaration({
        type: ParameterType.Boolean,
        name: OptionValue.REMOVE_SECONDARY_NAVIGATION,
        help: "Remove the secondary navigation?",
        defaultValue: false,
    });

    app.options.addDeclaration({
        type: ParameterType.Mixed,
        name: OptionValue.MARKDOWN_CONTENT_REPLACEMENT,
        help: "An Array of regex and replacement strings.",
        defaultValue: [],
    });

    app.renderer.theme = new CustomTheme(app.renderer);
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
            if (project.readme) {
                project.readme = this.replaceMarkdownContent(project.readme);
            }

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
                if (!markdown.pageUrl.startsWith("/")) {
                    throw new Error(`Markdown page url must start with "/", but got "${markdown.pageUrl}"`);
                }

                markdown.pageUrl = markdown.pageUrl.substring(1);

                if (!path.isAbsolute(markdown.filePath)) {
                    markdown.filePath = path.join(process.cwd(), markdown.filePath);
                }

                if (!fs.existsSync(markdown.filePath)) {
                    throw new Error(`Could not find markdown template at ${markdown.filePath}`);
                }

                const rawContent = fs.readFileSync(markdown.filePath, "utf8");
                const content = this.replaceMarkdownContent(rawContent);

                files.push(
                    new UrlMapping(`${markdown.pageUrl}.html`, project, () => {
                        return this.getRenderContext().markdownTemplate(content);
                    })
                );
            }
        }

        return files;
    };

    replaceMarkdownContent = (content: string) => {
        const replacements = this.application.options.getValue(OptionValue.MARKDOWN_CONTENT_REPLACEMENT) as MarkdownContentReplacement[];

        if (replacements && Array.isArray(replacements) && replacements.length > 0) {
            for (const replacement of replacements) {
                while (content.match(replacement.content)) {
                    content = content.replace(replacement.content, replacement.replacement);
                }
            }
        }

        return content;
    };
}

export class CustomThemeElement extends DefaultThemeRenderContext {
    constructor(theme: DefaultTheme, options: Options) {
        super(theme, options);
    }

    navigation = (props: PageEvent<Reflection>) => {
        const removePrimaryNavigation = this.options.getValue(OptionValue.REMOVE_PRIMARY_NAVIGATION);
        const removeSecondaryNavigation = this.options.getValue(OptionValue.REMOVE_SECONDARY_NAVIGATION);

        return (
            <>
                {this.customNavigation(props)}
                {!removePrimaryNavigation && this.primaryNavigation(props)}
                {!removeSecondaryNavigation && this.secondaryNavigation(props)}
            </>
        );
    };

    markdownTemplate = (content: string) => {
        return (
            <div class="tsd-panel tsd-typography">
                <JSX.Raw html={this.markdown(content)} />
            </div>
        );
    };

    customNavigation = (props: PageEvent<Reflection>) => {
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
            <nav class="tsd-navigation primary custom">
                <ul>
                    {navigations.map((navigation, index) => (
                        <li class={`navigation-${index}`}>
                            <h3 class="current">{navigation.title}</h3>

                            <ul>
                                {navigation.links.map((links) => {
                                    let link = links.href;

                                    if (!link.startsWith("/")) {
                                        throw new Error(`Custom navigation link must start with "/", but got "${link}"`);
                                    }

                                    link = link.substring(1);
                                    const out = this.options.getValue("out");
                                    const root = path.relative(path.dirname(props.filename), out);
                                    const href = path.posix.join(root, link);

                                    return (
                                        <li>
                                            <a href={href}>{links.label}</a>
                                        </li>
                                    );
                                })}
                            </ul>
                        </li>
                    ))}
                </ul>
            </nav>
        );
    };

    primaryNavigation(props: PageEvent<Reflection>) {
        const link = (mod: DeclarationReflection) => {
            const current = this.utils.inPath(mod, props.model);
            let childNav: JSX.Element | undefined;
            if (current) {
                const childModules = mod.children?.filter((m) => m.kindOf(ReflectionKind.SomeModule));
                if (childModules?.length) {
                    childNav = <ul>{childModules.map(link)}</ul>;
                }
            }

            return (
                <li class={this.utils.classNames({ current }) + " " + mod.cssClasses}>
                    <a href={this.urlTo(mod)}>{this.utils.wbr(mod.name)}</a>
                    {childNav}
                </li>
            );
        };

        const modules = props.model.project.getChildrenByKind(ReflectionKind.SomeModule);
        const projectLinkName = modules.some((m) => m.kindOf(ReflectionKind.Module)) ? "Modules" : "Exports";

        const [ext, int] = this.utils.partition(modules, (m) => m.flags.isExternal);

        if (ext.length === 0) {
            return (
                <nav class="tsd-navigation primary">
                    <ul>
                        <li class={this.utils.classNames({ current: props.model.isProject() })}>
                            <a href={this.urlTo(props.model.project)}>{projectLinkName}</a>
                        </li>
                        {int.map(link)}
                    </ul>
                </nav>
            );
        }

        return (
            <nav class="tsd-navigation primary">
                <ul>
                    <li class={this.utils.classNames({ current: props.model.isProject() })}>
                        <a href={this.urlTo(props.model.project)}>{projectLinkName}</a>
                    </li>
                    <li class="label tsd-is-external">
                        <span>Internals</span>
                    </li>
                    {int.map(link)}
                    <li class="label tsd-is-external">
                        <span>Externals</span>
                    </li>
                    {ext.map(link)}
                </ul>
            </nav>
        );
    }

    secondaryNavigation(props: PageEvent<Reflection>) {
        const children = props.model instanceof ContainerReflection ? props.model.children || [] : [];

        // Multiple entry points, and on main project page.
        if (props.model.isProject() && props.model.getChildrenByKind(ReflectionKind.Module).length) {
            return;
        }

        // TODO: TypeDoc 0.21 did special things here. If there were more than 40
        // children of this page's parent, it only displayed this page's children.
        // Otherwise, it displayed *everything*. For now, only display page children.
        // It seems weird to do this according to a random hardcoded number. At the very
        // least this should be added as a configurable flag, but maybe even the whole
        // behavior should be configurable globally...

        const pageNavigation = (
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
        );

        if (props.model.kindOf(ReflectionKind.SomeModule | ReflectionKind.Project)) {
            return <nav class="tsd-navigation secondary menu-sticky">{pageNavigation}</nav>;
        }

        return (
            <nav class="tsd-navigation secondary menu-sticky">
                <ul>
                    <li class={"current " + props.model.cssClasses}>
                        <a href={this.urlTo(props.model)} class="tsd-kind-icon">
                            {this.utils.wbr(props.model.name)}
                        </a>
                        {pageNavigation}
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
        inPath(thisPage: Reflection, toCheck: Reflection | undefined): boolean {
            while (toCheck) {
                if (toCheck.isProject()) return false;

                if (thisPage === toCheck) return true;

                toCheck = toCheck.parent;
            }

            return false;
        },
        classNames(names: Record<string, boolean | null | undefined>) {
            return Object.entries(names)
                .filter(([, include]) => include)
                .map(([key]) => key)
                .join(" ");
        },
        partition<T>(iter: Iterable<T>, predicate: (item: T) => boolean): [T[], T[]] {
            const left: T[] = [];
            const right: T[] = [];

            for (const item of iter) {
                if (predicate(item)) {
                    left.push(item);
                } else {
                    right.push(item);
                }
            }

            return [left, right];
        },
    };
}
