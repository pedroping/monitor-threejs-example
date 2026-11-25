/*
 * parser.y - grammar and command logic of the portfolio terminal engine.
 *
 * How a command flows through the engine:
 *
 *   JavaScript calls process_command("cat projects", "<portfolio JSON>")
 *     -> the JSON is parsed with cJSON into `portfolio_data`
 *     -> lexer.l (Flex) splits the command into tokens: T_CAT T_SEC_PROJECTS
 *     -> the grammar below (Bison) matches a rule and runs its action
 *     -> the action appends formatted text to `output_buffer`
 *     -> process_command returns that text to JavaScript
 *
 * Special replies understood by the JavaScript side:
 *   "COMMAND_CLEAR"               clear the terminal screen
 *   "[[PROFILE_ART]]", "[[ICON:x]]" placeholders JS replaces with ASCII art
 *
 * Bison copies everything between %{ and %} to the top of the generated
 * parser.tab.c, so the C helpers used by the grammar actions live there.
 */
%{
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <emscripten.h>
#include "cJSON.h"

/* Provided by the Flex-generated lexer (lex.yy.c). */
int yylex(void);
void yyerror(const char *s);
int yyparse(void);
typedef struct yy_buffer_state *YY_BUFFER_STATE;
YY_BUFFER_STATE yy_scan_string(const char *str);
void yy_delete_buffer(YY_BUFFER_STATE b);

/* ------------------------------------------------------------------------ */
/* Output buffer: everything a command prints is appended here.             */
/* ------------------------------------------------------------------------ */

#define OUTPUT_BUFFER_SIZE 65536
static char output_buffer[OUTPUT_BUFFER_SIZE];
static size_t out_len = 0;

/* Appends `src` to the output. Text that would overflow the buffer is dropped. */
static void append_output(const char *src) {
    if (!src) return;
    size_t slen = strlen(src);
    if (out_len + slen < OUTPUT_BUFFER_SIZE - 1) {
        memcpy(output_buffer + out_len, src, slen);
        out_len += slen;
        output_buffer[out_len] = '\0';
    }
}

/* Appends `text`, then a newline unless `text` already ends with one. */
static void append_line(const char *text) {
    append_output(text);
    size_t len = strlen(text);
    if (len > 0 && text[len - 1] != '\n') append_output("\n");
}

/* ------------------------------------------------------------------------ */
/* Portfolio data (JSON) helpers                                            */
/* ------------------------------------------------------------------------ */

/* Parsed portfolio JSON; only valid while process_command() runs. */
static cJSON *portfolio_data = NULL;

/* Returns obj[key] if it is a string, otherwise "N/A". Never returns NULL. */
static const char *get_string(cJSON *obj, const char *key) {
    if (!obj) return "N/A";
    cJSON *item = cJSON_GetObjectItem(obj, key);
    return (item && cJSON_IsString(item) && item->valuestring) ? item->valuestring : "N/A";
}

/* True when a field holds real text: not empty and not the "N/A" placeholder. */
static int has_text(const char *value) {
    return value && strlen(value) > 0 && strcmp(value, "N/A") != 0;
}

/* ------------------------------------------------------------------------ */
/* Section formatters: one per portfolio section (`cat <section>`).         */
/* ------------------------------------------------------------------------ */

static void format_about(cJSON *about) {
    append_output("\n--- About Me ---\n\n");
    append_output(get_string(about, "content"));
    append_output("\n");
}

static void format_projects(cJSON *projects) {
    append_output("\n--- Projects ---\n");
    if (!projects || !cJSON_IsArray(projects)) {
        append_output("No projects found.\n");
        return;
    }
    cJSON *project = NULL;
    cJSON_ArrayForEach(project, projects) {
        const char *subtitle = get_string(project, "subtitle");
        const char *desc = get_string(project, "description");
        const char *link = get_string(project, "github");

        /* Title (Subtitle) */
        append_output("\n");
        append_output(get_string(project, "title"));
        if (has_text(subtitle)) {
            append_output(" (");
            append_output(subtitle);
            append_output(")");
        }
        append_output("\n");

        if (has_text(desc)) {
            append_output("Desc: ");
            append_output(desc);
            append_output("\n");
        }
        if (has_text(link)) {
            append_output("Link: ");
            append_output(link);
            append_output("\n");
        }
    }
}

static void format_experience(cJSON *experiences) {
    append_output("\n--- Professional Experience ---\n");
    if (!experiences || !cJSON_IsArray(experiences)) {
        append_output("No experience records found.\n");
        return;
    }
    cJSON *exp = NULL;
    cJSON_ArrayForEach(exp, experiences) {
        const char *company = get_string(exp, "company");
        const char *duration = get_string(exp, "duration");

        /* Title @ Company (Duration) */
        append_output("\n");
        append_output(get_string(exp, "title"));
        if (has_text(company)) {
            append_output(" @ ");
            append_output(company);
        }
        if (has_text(duration)) {
            append_output(" (");
            append_output(duration);
            append_output(")");
        }
        append_output("\n");

        /* One bullet per description line. */
        cJSON *lines = cJSON_GetObjectItem(exp, "description");
        if (lines && cJSON_IsArray(lines)) {
            cJSON *line = NULL;
            cJSON_ArrayForEach(line, lines) {
                if (line && line->valuestring) {
                    append_output("  - ");
                    append_line(line->valuestring);
                }
            }
        }
    }
}

static void format_skills(cJSON *skills) {
    append_output("\n--- Technical Skills ---\n");
    if (!skills) return;

    /* JSON key and display title of each category, in display order. */
    static const char *const categories[][2] = {
        {"languages", "Languages"},
        {"frameworks_libraries", "Frameworks & Libraries"},
        {"tools_platforms", "Tools & Platforms"},
        {"concepts", "Concepts"},
    };
    for (size_t i = 0; i < sizeof(categories) / sizeof(categories[0]); i++) {
        cJSON *items = cJSON_GetObjectItem(skills, categories[i][0]);
        if (!items || !cJSON_IsArray(items)) continue;

        char header[128];
        snprintf(header, sizeof(header), "\n[%s]\n", categories[i][1]);
        append_output(header);

        cJSON *item = NULL;
        cJSON_ArrayForEach(item, items) {
            if (item && item->valuestring) append_line(item->valuestring);
        }
    }
    append_output("\n");
}

static void format_education(cJSON *education) {
    append_output("\n--- Education ---\n\n");
    char buffer[512];
    snprintf(buffer, sizeof(buffer), "%s\n%s\nExpected Graduation / Conferred: %s\n",
             get_string(education, "degree"),
             get_string(education, "institution"),
             get_string(education, "graduation_date"));
    append_output(buffer);
}

static void format_awards(cJSON *awards) {
    append_output("\n--- Honors and Awards ---\n\n");
    if (!awards || !cJSON_IsArray(awards)) {
        append_output("No awards listed.\n");
        return;
    }
    cJSON *award = NULL;
    cJSON_ArrayForEach(award, awards) {
        /*   - Award, Event (Date) */
        append_output("  - ");
        append_output(get_string(award, "award"));
        append_output(", ");
        append_output(get_string(award, "event"));
        append_output(" (");
        append_output(get_string(award, "date"));
        append_output(")\n");
    }
}

static void format_contact(cJSON *contact) {
    append_output("\n--- Contact Information ---\n\n");
    char buffer[512];
    snprintf(buffer, sizeof(buffer), "Email:    %s\nLinkedIn: %s\nGitHub:   %s\n",
             get_string(contact, "email"),
             get_string(contact, "linkedin"),
             get_string(contact, "github_profile"));
    append_output(buffer);
}

/* Section name (as used in the JSON and in `cat <name>`) -> its formatter. */
typedef void (*SectionFormatter)(cJSON *);
static const struct {
    const char *name;
    SectionFormatter format;
} SECTIONS[] = {
    {"about", format_about},
    {"projects", format_projects},
    {"experience", format_experience},
    {"skills", format_skills},
    {"education", format_education},
    {"awards", format_awards},
    {"contact", format_contact},
};

/* ------------------------------------------------------------------------ */
/* Command handlers, called from the grammar actions below.                 */
/* ------------------------------------------------------------------------ */

/* `cat <section>` or just `<section>`. */
static void show_section(const char *section) {
    if (!portfolio_data) {
        append_output("\nError: Portfolio data is not loaded.\n");
        return;
    }
    cJSON *data = cJSON_GetObjectItem(portfolio_data, section);
    if (!data) {
        char error[256];
        snprintf(error, sizeof(error), "\nError: Section '%s' not found. Type 'ls' to see sections.\n", section);
        append_output(error);
        return;
    }
    for (size_t i = 0; i < sizeof(SECTIONS) / sizeof(SECTIONS[0]); i++) {
        if (strcmp(section, SECTIONS[i].name) == 0) {
            SECTIONS[i].format(data);
            return;
        }
    }
    /* The JSON has this key, but there is no formatter for it. */
    char error[256];
    snprintf(error, sizeof(error), "\nError: Display logic for '%s' is not implemented.\n", section);
    append_output(error);
}

static void show_ls(void) {
    append_output("\nAvailable sections:\n");
    append_output("  about         Personal background and bio\n");
    append_output("  projects      Featured software projects\n");
    append_output("  skills        Technical skills and tools\n");
    append_output("  experience    Professional work history\n");
    append_output("  education     Academic background\n");
    append_output("  awards        Honors and awards\n");
    append_output("  contact       Email, LinkedIn, and GitHub\n\n");
    append_output("Usage: cat <section>  or simply type the section name.\n");
}

static void show_whoami(void) {
    append_output("\nMatthew Nader (user@portfolio)\n");
    append_output("Software Engineer & Systems Developer\n");
}

static void show_help(void) {
    append_output("\n--- Portfolio Terminal Help ---\n");
    append_output("Commands:\n");
    append_output("  cat <section>    Display content of a section\n");
    append_output("  ls, dir          List all available sections\n");
    append_output("  about            Shortcut to view About Me\n");
    append_output("  projects         Shortcut to view Projects\n");
    append_output("  skills           Shortcut to view Skills\n");
    append_output("  experience       Shortcut to view Experience\n");
    append_output("  education        Shortcut to view Education\n");
    append_output("  awards           Shortcut to view Awards\n");
    append_output("  contact          Shortcut to view Contact Info\n");
    append_output("  echo <text>      Echo text to terminal\n");
    append_output("  whoami, id       Display current user identity\n");
    append_output("  date             Display system date and time\n");
    append_output("  pwd              Print working directory\n");
    append_output("  clear, cls       Clear the terminal screen\n");
    append_output("  help             Show this help message\n");
}

static void show_echo(const char *text) {
    append_output("\n");
    if (text) append_output(text);
    append_output("\n");
}

static void show_date(void) {
    time_t now = time(NULL);
    char buffer[128];
    strftime(buffer, sizeof(buffer), "\n%a %b %d %H:%M:%S UTC %Y\n", localtime(&now));
    append_output(buffer);
}

static void show_pwd(void) {
    append_output("\n/home/user/portfolio\n");
}

/* ------------------------------------------------------------------------ */
/* Entry point exported to JavaScript.                                      */
/* ------------------------------------------------------------------------ */

/*
 * Runs one command line against the portfolio JSON and returns the text to
 * print. The returned pointer is a static buffer, valid until the next call.
 * JS side: engine.cwrap("process_command", "string", ["string", "string"]).
 */
EMSCRIPTEN_KEEPALIVE
const char *process_command(const char *command_str, const char *json_data_str) {
    output_buffer[0] = '\0';
    out_len = 0;

    if (portfolio_data) cJSON_Delete(portfolio_data);
    portfolio_data = cJSON_Parse(json_data_str);
    if (portfolio_data == NULL) {
        snprintf(output_buffer, OUTPUT_BUFFER_SIZE, "Error: Failed to parse internal portfolio data.");
        return output_buffer;
    }

    /* Point the lexer at the command string and run the parser on it. */
    YY_BUFFER_STATE buffer = yy_scan_string(command_str);
    yyparse();
    yy_delete_buffer(buffer);

    cJSON_Delete(portfolio_data);
    portfolio_data = NULL;
    return output_buffer;
}
%}

/* ------------------------------------------------------------------------ */
/* Tokens (produced by lexer.l)                                             */
/* ------------------------------------------------------------------------ */

/* Tokens that carry text (T_IDENTIFIER, T_STRING) pass a malloc'd string. */
%union { char *str; }
%token <str> T_IDENTIFIER T_STRING
%token T_CAT T_ECHO T_HELP T_CLEAR T_LS T_WHOAMI T_DATE T_PWD T_HISTORY T_EXIT T_EOL
%token T_SEC_ABOUT T_SEC_PROJECTS T_SEC_SKILLS T_SEC_EXPERIENCE T_SEC_EDUCATION T_SEC_AWARDS T_SEC_CONTACT

%type <str> text_list text_arg

%%

/* ------------------------------------------------------------------------ */
/* Grammar: one command per call, optionally followed by a newline.         */
/* ------------------------------------------------------------------------ */

input:
      /* empty */
    | line
    ;

line:
      command
    | command T_EOL
    | T_EOL
    ;

command:
    /* cat <section> */
      T_CAT T_IDENTIFIER        { show_section($2); free($2); }
    | T_CAT T_SEC_ABOUT         { show_section("about"); }
    | T_CAT T_SEC_PROJECTS      { show_section("projects"); }
    | T_CAT T_SEC_SKILLS        { show_section("skills"); }
    | T_CAT T_SEC_EXPERIENCE    { show_section("experience"); }
    | T_CAT T_SEC_EDUCATION     { show_section("education"); }
    | T_CAT T_SEC_AWARDS        { show_section("awards"); }
    | T_CAT T_SEC_CONTACT       { show_section("contact"); }
    | T_CAT                     { append_output("\ncat: missing section argument.\nUsage: cat <section> (e.g. 'cat about', 'cat projects')\nType 'ls' for all sections.\n"); }

    /* A section name on its own is a shortcut for `cat <section>`. */
    | T_SEC_ABOUT               { show_section("about"); }
    | T_SEC_PROJECTS            { show_section("projects"); }
    | T_SEC_SKILLS              { show_section("skills"); }
    | T_SEC_EXPERIENCE          { show_section("experience"); }
    | T_SEC_EDUCATION           { show_section("education"); }
    | T_SEC_AWARDS              { show_section("awards"); }
    | T_SEC_CONTACT             { show_section("contact"); }

    /* Other commands */
    | T_ECHO text_list          { show_echo($2); free($2); }
    | T_ECHO                    { show_echo(""); }
    | T_LS                      { show_ls(); }
    | T_WHOAMI                  { show_whoami(); }
    | T_DATE                    { show_date(); }
    | T_PWD                     { show_pwd(); }
    | T_HISTORY                 { append_output("\nUse Up/Down arrows on your keyboard to navigate command history.\n"); }
    | T_EXIT                    { append_output("\nSession cannot be closed. Type 'help' for commands.\n"); }
    | T_HELP                    { show_help(); }
    | T_CLEAR                   { strncpy(output_buffer, "COMMAND_CLEAR", OUTPUT_BUFFER_SIZE); }
    ;

/* The words after `echo`, joined with single spaces. */
text_list:
      text_arg                  { $$ = $1; }
    | text_list text_arg        {
        size_t len1 = strlen($1);
        size_t len2 = strlen($2);
        char *combined = (char *)malloc(len1 + 1 + len2 + 1);
        if (combined) {
            strcpy(combined, $1);
            strcat(combined, " ");
            strcat(combined, $2);
            free($1);
            $$ = combined;
        } else {
            $$ = $1; /* out of memory: keep what we have so far */
        }
        free($2);
    }
    ;

text_arg:
      T_IDENTIFIER              { $$ = $1; }
    | T_STRING                  { $$ = $1; }
    ;

%%

/* Called by Bison on a syntax error (an unknown or malformed command). */
void yyerror(const char *s) {
    (void)s;
    if (out_len == 0) {
        snprintf(output_buffer, OUTPUT_BUFFER_SIZE, "\nCommand not recognized. Type 'help' for usage or 'ls' for sections.\n");
        out_len = strlen(output_buffer);
    }
}
